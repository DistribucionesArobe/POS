"""Endpoints Gmail Sync: OAuth flow, sync manual, listar pendientes, aprobar."""
from datetime import datetime, timedelta
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    GmailConexion, GmailImportacionLog, Usuario, Empresa, Proveedor,
    CuentaPorPagar,
)
from app.services.security import get_active_empresa_id, get_current_user
from app.services import gmail_sync_service as svc

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/gmail", tags=["gmail"])


# ============ OAUTH FLOW ============

@router.get("/oauth/start")
def oauth_start(
    empresa_id: int = Depends(get_active_empresa_id),
):
    """Regresa la URL a la que el frontend debe redirigir para iniciar OAuth."""
    url = svc.build_auth_url(empresa_id=empresa_id)
    return {"auth_url": url}


@router.get("/oauth/callback")
def oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    error: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Callback de Google. Intercambia el code por tokens y guarda la conexion.
    Al terminar redirige al frontend."""
    frontend_url = "https://aceromax-pos-frontend.onrender.com/gmail-sync"

    if error:
        return RedirectResponse(f"{frontend_url}?error={error}")

    # Parse state para sacar empresa_id
    try:
        parts = state.split(":")
        empresa_id = int(parts[1])
    except Exception:
        return RedirectResponse(f"{frontend_url}?error=state_invalido")

    try:
        tokens = svc.exchange_code(code)
        refresh_token = tokens.get("refresh_token")
        access_token = tokens.get("access_token")
        expires_in = tokens.get("expires_in", 3600)
        if not refresh_token:
            return RedirectResponse(f"{frontend_url}?error=sin_refresh_token")

        email = svc.get_user_email(access_token)

        # Upsert conexion
        conn = db.query(GmailConexion).filter(GmailConexion.empresa_id == empresa_id).first()
        if not conn:
            conn = GmailConexion(empresa_id=empresa_id)
            db.add(conn)
        conn.email_conectado = email
        conn.refresh_token_encrypted = svc.encriptar_token(refresh_token)
        conn.access_token = access_token
        conn.access_token_expira_en = datetime.utcnow() + timedelta(seconds=expires_in - 60)
        conn.activo = True
        conn.actualizado_en = datetime.utcnow()
        db.commit()

        return RedirectResponse(f"{frontend_url}?connected={email}")
    except Exception as e:
        logger.error("OAuth callback fallo: %s", e)
        return RedirectResponse(f"{frontend_url}?error={str(e)[:100]}")


@router.get("/status")
def status(
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    conn = db.query(GmailConexion).filter(GmailConexion.empresa_id == empresa_id).first()
    if not conn:
        return {"conectado": False}
    pendientes = db.query(GmailImportacionLog).filter(
        GmailImportacionLog.empresa_id == empresa_id,
        GmailImportacionLog.estado == "pendiente",
    ).count()
    return {
        "conectado": True,
        "email": conn.email_conectado,
        "activo": conn.activo,
        "modo": conn.modo,
        "ultima_sync_en": conn.ultima_sync_en.isoformat() if conn.ultima_sync_en else None,
        "frecuencia_min": conn.frecuencia_min,
        "pendientes_aprobacion": pendientes,
    }


@router.delete("/disconnect")
def disconnect(
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    conn = db.query(GmailConexion).filter(GmailConexion.empresa_id == empresa_id).first()
    if conn:
        db.delete(conn)
        db.commit()
    return {"ok": True}


# ============ SYNC MANUAL ============

def _get_valid_access_token(conn: GmailConexion, db: Session) -> str:
    """Regresa un access_token valido, refrescando si expiro."""
    if conn.access_token and conn.access_token_expira_en and \
       datetime.utcnow() < conn.access_token_expira_en:
        return conn.access_token
    # Refresh
    refresh = svc.desencriptar_token(conn.refresh_token_encrypted)
    tokens = svc.refresh_access_token(refresh)
    conn.access_token = tokens["access_token"]
    conn.access_token_expira_en = datetime.utcnow() + timedelta(seconds=tokens.get("expires_in", 3600) - 60)
    db.commit()
    return conn.access_token


@router.post("/sync")
def sync_manual(
    dias_atras: int = 60,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Corre sync manual: busca correos con XML, parsea y guarda como pendientes."""
    conn = db.query(GmailConexion).filter(GmailConexion.empresa_id == empresa_id).first()
    if not conn or not conn.activo:
        raise HTTPException(400, "No hay conexion Gmail activa. Conecta primero.")

    empresa = db.get(Empresa, empresa_id)
    receptor_rfc = empresa.rfc if empresa else ""

    access_token = _get_valid_access_token(conn, db)

    stats = {
        "buscados": 0, "sin_xml": 0, "ya_procesados": 0,
        "descartados": 0, "guardados_pendientes": 0, "errores": 0,
    }

    mensajes = svc.buscar_mensajes_con_xml(access_token, dias_atras=dias_atras)
    stats["buscados"] = len(mensajes)

    for m in mensajes:
        msg_id = m["id"]
        # Ya procesado?
        exists = db.query(GmailImportacionLog).filter(
            GmailImportacionLog.empresa_id == empresa_id,
            GmailImportacionLog.mensaje_gmail_id == msg_id,
        ).first()
        if exists:
            stats["ya_procesados"] += 1
            continue

        try:
            msg = svc.obtener_mensaje(access_token, msg_id)
            headers = svc.extraer_headers(msg)
            adjuntos = svc.encontrar_adjuntos_xml(msg)
            if not adjuntos:
                stats["sin_xml"] += 1
                continue

            xml_bytes = svc.obtener_adjunto(access_token, msg_id, adjuntos[0]["attachmentId"])
            cfdi = svc.parsear_cfdi(xml_bytes)

            valido, razon = svc.es_mercancia_credito(cfdi, receptor_rfc)
            log = GmailImportacionLog(
                empresa_id=empresa_id,
                mensaje_gmail_id=msg_id,
                thread_gmail_id=msg.get("threadId"),
                remitente_email=headers.get("from", "")[:255],
                asunto=headers.get("subject", "")[:500],
                fecha_correo=_parse_email_date(headers.get("date")),
                xml_uuid=cfdi["uuid"],
                xml_folio=cfdi["folio"],
                xml_serie=cfdi["serie"],
                proveedor_rfc=cfdi["emisor_rfc"],
                proveedor_nombre_xml=cfdi["emisor_nombre"][:255],
                total=cfdi["total"],
                subtotal=cfdi["subtotal"],
                iva=cfdi["iva"],
                metodo_pago_sat=cfdi["metodo_pago"],
                forma_pago_sat=cfdi["forma_pago"],
                moneda=cfdi["moneda"],
                fecha_emision=_parse_fecha_cfdi(cfdi["fecha"]),
                tipo_comprobante=cfdi["tipo"],
                xml_raw=xml_bytes.decode("utf-8-sig", errors="replace")[:100000],
                estado="descartado" if not valido else ("importado" if conn.modo == "auto" else "pendiente"),
                razon_descartado=razon,
            )

            # Match proveedor por RFC si aplica
            if valido and cfdi["emisor_rfc"]:
                prov = db.query(Proveedor).filter(
                    Proveedor.empresa_id == empresa_id,
                    Proveedor.rfc == cfdi["emisor_rfc"],
                ).first()
                if prov:
                    log.proveedor_id = prov.id

            db.add(log)
            db.commit()

            if not valido:
                stats["descartados"] += 1
            else:
                stats["guardados_pendientes"] += 1

        except Exception as e:
            logger.error("Sync msg %s fallo: %s", msg_id, e)
            stats["errores"] += 1
            db.rollback()

    conn.ultima_sync_en = datetime.utcnow()
    db.commit()

    return {"stats": stats}


def _parse_email_date(s: str | None) -> datetime | None:
    if not s: return None
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(s).replace(tzinfo=None)
    except Exception:
        return None


def _parse_fecha_cfdi(s: str | None) -> datetime | None:
    if not s: return None
    try:
        return datetime.fromisoformat(s.replace("Z", ""))
    except Exception:
        return None


# ============ PENDIENTES / APROBACION ============

@router.get("/pendientes")
def listar_pendientes(
    estado: str = Query("pendiente"),
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(GmailImportacionLog)
        .filter(GmailImportacionLog.empresa_id == empresa_id)
        .filter(GmailImportacionLog.estado == estado)
        .order_by(GmailImportacionLog.fecha_correo.desc().nullslast())
        .limit(300).all()
    )
    return [{
        "id": r.id, "estado": r.estado,
        "fecha_correo": r.fecha_correo.isoformat() if r.fecha_correo else None,
        "remitente": r.remitente_email, "asunto": r.asunto,
        "proveedor_rfc": r.proveedor_rfc, "proveedor_nombre": r.proveedor_nombre_xml,
        "folio": f"{r.xml_serie or ''}{r.xml_folio or ''}",
        "uuid": r.xml_uuid,
        "total": float(r.total or 0), "moneda": r.moneda,
        "metodo_pago": r.metodo_pago_sat, "forma_pago": r.forma_pago_sat,
        "fecha_emision": r.fecha_emision.isoformat() if r.fecha_emision else None,
        "razon_descartado": r.razon_descartado,
        "cxp_id": r.cxp_id, "proveedor_id": r.proveedor_id,
    } for r in rows]


class AprobarIn(BaseModel):
    dias_credito: int = 30


@router.post("/pendientes/{log_id}/aprobar")
def aprobar_pendiente(
    log_id: int, payload: AprobarIn,
    empresa_id: int = Depends(get_active_empresa_id),
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crea el proveedor (si no existe) y la CxP a partir del log."""
    log = db.get(GmailImportacionLog, log_id)
    if not log or log.empresa_id != empresa_id:
        raise HTTPException(404, "Registro no existe")
    if log.estado != "pendiente":
        raise HTTPException(400, f"Estado {log.estado}, no se puede aprobar")

    # Crear proveedor si no existe
    prov = None
    if log.proveedor_id:
        prov = db.get(Proveedor, log.proveedor_id)
    if not prov and log.proveedor_rfc:
        prov = db.query(Proveedor).filter(
            Proveedor.empresa_id == empresa_id,
            Proveedor.rfc == log.proveedor_rfc,
        ).first()
    if not prov:
        prov = Proveedor(
            empresa_id=empresa_id,
            nombre=(log.proveedor_nombre_xml or log.proveedor_rfc or "Sin nombre")[:200],
            rfc=log.proveedor_rfc,
            razon_social=log.proveedor_nombre_xml,
            activo=True, creado_en=datetime.utcnow(),
        )
        db.add(prov)
        db.flush()

    # Crear CxP
    fecha_recepcion = log.fecha_emision or datetime.utcnow()
    monto = float(log.total or 0)
    cxp = CuentaPorPagar(
        empresa_id=empresa_id,
        proveedor_id=prov.id,
        folio_factura=f"{log.xml_serie or ''}{log.xml_folio or ''}" or None,
        fecha_recepcion=fecha_recepcion,
        fecha_vencimiento=fecha_recepcion + timedelta(days=payload.dias_credito),
        monto_original=monto,
        saldo=monto,
        pagado=False,
        corto_plazo=True,
        moneda=log.moneda or "MXN",
        observaciones=f"Importada de Gmail. UUID: {log.xml_uuid}",
        creado_en=datetime.utcnow(),
    )
    db.add(cxp)
    db.flush()

    log.estado = "importado"
    log.proveedor_id = prov.id
    log.cxp_id = cxp.id
    log.aprobado_por = usuario.id
    log.aprobado_en = datetime.utcnow()
    db.commit()

    return {"ok": True, "cxp_id": cxp.id, "proveedor_id": prov.id}


@router.post("/pendientes/{log_id}/rechazar")
def rechazar_pendiente(
    log_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    log = db.get(GmailImportacionLog, log_id)
    if not log or log.empresa_id != empresa_id:
        raise HTTPException(404, "Registro no existe")
    log.estado = "rechazado"
    db.commit()
    return {"ok": True}
