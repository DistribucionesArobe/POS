"""Gmail Sync Service - OAuth + descarga adjuntos + parseo CFDI XML.

Multi-tenant: cada empresa tiene su propia conexion con Gmail. El refresh_token
se guarda encriptado con Fernet (env: GMAIL_ENCRYPTION_KEY).

Flujo de sincronizacion:
 1. Refresh el access_token si expiró
 2. Buscar correos con XML adjunto desde la ultima sync (o 60 dias atras si primera vez)
 3. Descargar attachments XML
 4. Parsear CFDI: RFC emisor, folio, total, metodo pago, etc.
 5. Filtrar: excluir sus propios envios (cliente RFC), gasolineras, servicios, no-mercancia
 6. Guardar en gmail_importacion_log como 'pendiente' (o 'importado' si modo=auto)
"""
import os
import base64
import logging
from datetime import datetime, timedelta
from xml.etree import ElementTree as ET
from typing import Any

import httpx
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "")
GMAIL_ENCRYPTION_KEY = os.getenv("GMAIL_ENCRYPTION_KEY", "")

# Scopes minimos necesarios
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        if not GMAIL_ENCRYPTION_KEY:
            raise RuntimeError("GMAIL_ENCRYPTION_KEY no configurada en env")
        _fernet = Fernet(GMAIL_ENCRYPTION_KEY.encode())
    return _fernet


def encriptar_token(token: str) -> str:
    return _get_fernet().encrypt(token.encode()).decode()


def desencriptar_token(token_encriptado: str) -> str:
    return _get_fernet().decrypt(token_encriptado.encode()).decode()


# ============ OAUTH ============

def build_auth_url(empresa_id: int, state_extra: str = "") -> str:
    """Genera la URL de autorizacion Google para conectar Gmail de una empresa."""
    from urllib.parse import urlencode
    state = f"emp:{empresa_id}"
    if state_extra:
        state += f":{state_extra}"
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",   # requerido para refresh_token
        "prompt": "consent",         # forzar consent para siempre recibir refresh_token
        "state": state,
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)


def exchange_code(code: str) -> dict:
    """Intercambia el code por access_token + refresh_token."""
    r = httpx.post("https://oauth2.googleapis.com/token", data={
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }, timeout=30)
    if r.status_code >= 400:
        raise RuntimeError(f"OAuth code exchange fallo: {r.status_code} {r.text}")
    return r.json()


def refresh_access_token(refresh_token: str) -> dict:
    """Usa el refresh_token para obtener un nuevo access_token."""
    r = httpx.post("https://oauth2.googleapis.com/token", data={
        "refresh_token": refresh_token,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "grant_type": "refresh_token",
    }, timeout=30)
    if r.status_code >= 400:
        raise RuntimeError(f"Refresh token fallo: {r.status_code} {r.text}")
    return r.json()


def get_user_email(access_token: str) -> str:
    """Regresa el email del usuario dueno del access_token."""
    r = httpx.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=15,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"userinfo fallo: {r.text}")
    return r.json().get("email", "")


# ============ GMAIL API ============

def _gmail_get(access_token: str, path: str, params: dict | None = None) -> dict:
    r = httpx.get(
        f"https://gmail.googleapis.com/gmail/v1/users/me/{path}",
        headers={"Authorization": f"Bearer {access_token}"},
        params=params or {}, timeout=30,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"Gmail API {path} fallo: {r.status_code} {r.text[:300]}")
    return r.json()


def buscar_mensajes_con_xml(access_token: str, dias_atras: int = 60) -> list[dict]:
    """Busca correos con adjunto XML de los ultimos N dias."""
    q = f"has:attachment filename:xml newer_than:{dias_atras}d -in:sent"
    resultado = []
    page_token = None
    for _ in range(20):  # max 20 paginas = 10000 msgs (mas que suficiente)
        params: dict[str, Any] = {"q": q, "maxResults": 500}
        if page_token:
            params["pageToken"] = page_token
        r = _gmail_get(access_token, "messages", params)
        for m in r.get("messages", []):
            resultado.append(m)
        page_token = r.get("nextPageToken")
        if not page_token:
            break
    return resultado


def obtener_mensaje(access_token: str, msg_id: str) -> dict:
    return _gmail_get(access_token, f"messages/{msg_id}", {"format": "full"})


def obtener_adjunto(access_token: str, msg_id: str, attach_id: str) -> bytes:
    r = _gmail_get(access_token, f"messages/{msg_id}/attachments/{attach_id}")
    data = r.get("data", "")
    return base64.urlsafe_b64decode(data)


def encontrar_adjuntos_xml(msg: dict) -> list[dict]:
    """Recorre el mensaje y devuelve lista de {filename, attachmentId} con extension .xml."""
    encontrados = []
    def walk(part):
        filename = (part.get("filename") or "").lower()
        body = part.get("body", {})
        if filename.endswith(".xml") and body.get("attachmentId"):
            encontrados.append({
                "filename": part.get("filename"),
                "attachmentId": body["attachmentId"],
            })
        for sub in part.get("parts", []) or []:
            walk(sub)
    payload = msg.get("payload", {})
    walk(payload)
    return encontrados


def extraer_headers(msg: dict) -> dict:
    """Extrae From, Subject, Date en dict simple."""
    headers = {}
    for h in msg.get("payload", {}).get("headers", []) or []:
        n = h.get("name", "").lower()
        if n in ("from", "subject", "date", "to"):
            headers[n] = h.get("value", "")
    return headers


# ============ PARSER CFDI 4.0 XML ============

NS = {
    "cfdi": "http://www.sat.gob.mx/cfd/4",
    "tfd": "http://www.sat.gob.mx/TimbreFiscalDigital",
}


def parsear_cfdi(xml_bytes: bytes) -> dict:
    """Parsea un CFDI 4.0 y regresa dict con los datos importantes."""
    try:
        # Ignorar BOM y encoding declarations
        text = xml_bytes.decode("utf-8-sig", errors="replace")
        root = ET.fromstring(text)
    except Exception as e:
        raise ValueError(f"XML invalido: {e}")

    if not root.tag.endswith("Comprobante"):
        raise ValueError(f"No es CFDI Comprobante (raiz: {root.tag})")

    # Atributos del Comprobante
    tipo = root.get("TipoDeComprobante", "")  # I | E | P | N
    total = root.get("Total")
    subtotal = root.get("SubTotal")
    metodo_pago = root.get("MetodoPago", "")   # PUE | PPD
    forma_pago = root.get("FormaPago", "")
    moneda = root.get("Moneda", "MXN")
    fecha = root.get("Fecha", "")
    serie = root.get("Serie", "")
    folio = root.get("Folio", "")

    # Emisor
    emisor = root.find("cfdi:Emisor", NS)
    emisor_rfc = emisor.get("Rfc", "") if emisor is not None else ""
    emisor_nombre = emisor.get("Nombre", "") if emisor is not None else ""

    # Receptor
    receptor = root.find("cfdi:Receptor", NS)
    receptor_rfc = receptor.get("Rfc", "") if receptor is not None else ""
    receptor_nombre = receptor.get("Nombre", "") if receptor is not None else ""

    # Impuestos - buscar Total IVA trasladado
    iva_total = None
    impuestos = root.find("cfdi:Impuestos", NS)
    if impuestos is not None:
        iva_total = impuestos.get("TotalImpuestosTrasladados")

    # UUID del TFD
    uuid = ""
    complemento = root.find("cfdi:Complemento", NS)
    if complemento is not None:
        tfd = complemento.find("tfd:TimbreFiscalDigital", NS)
        if tfd is not None:
            uuid = tfd.get("UUID", "")

    return {
        "uuid": uuid,
        "serie": serie,
        "folio": folio,
        "tipo": tipo,
        "fecha": fecha,
        "moneda": moneda,
        "metodo_pago": metodo_pago,
        "forma_pago": forma_pago,
        "subtotal": float(subtotal) if subtotal else None,
        "iva": float(iva_total) if iva_total else None,
        "total": float(total) if total else None,
        "emisor_rfc": emisor_rfc,
        "emisor_nombre": emisor_nombre,
        "receptor_rfc": receptor_rfc,
        "receptor_nombre": receptor_nombre,
    }


# ============ HELPERS DE FILTRO ============

# RFCs de servicios/gastos que casi nunca son "mercancia para reventa"
RFC_EXCLUIR_DEFAULT = {
    # gasolineras conocidas
    "GAR920825TA5", "AEG980629L21",
}
# Categorias/dominios de remitentes que casi seguro NO son mercancia
DOMINIOS_EXCLUIR_DEFAULT = {
    "notificaciones@efectifactura.com.mx",  # gasolineras
    "no-reply@starlink.com",
}


def es_mercancia_credito(cfdi: dict, receptor_rfc_esperado: str) -> tuple[bool, str | None]:
    """Determina si el CFDI es mercancia a credito para la empresa dada.
    Regresa (es_valido, razon_descarte_si_no)."""
    if not cfdi.get("uuid"):
        return False, "CFDI sin UUID (no timbrado)"
    if cfdi.get("tipo") != "I":
        return False, f"Tipo {cfdi.get('tipo')} (no Ingreso/factura)"
    if receptor_rfc_esperado and cfdi.get("receptor_rfc", "").upper() != receptor_rfc_esperado.upper():
        return False, f"Receptor {cfdi.get('receptor_rfc')} distinto de empresa {receptor_rfc_esperado}"
    if cfdi.get("metodo_pago") != "PPD":
        return False, f"Metodo pago {cfdi.get('metodo_pago')} (solo se importan PPD credito)"
    if cfdi.get("emisor_rfc", "").upper() in RFC_EXCLUIR_DEFAULT:
        return False, f"Emisor {cfdi.get('emisor_rfc')} en lista de exclusion"
    return True, None
