"""Endpoints publicos para auto-registro de clientes via CSF.

El flujo:
  1. El vendedor comparte https://aceromax-pos-frontend.onrender.com/registro-cliente/{empresa_id}
     por WhatsApp o QR al cliente.
  2. El cliente sube su Constancia de Situacion Fiscal (PDF o foto).
  3. Claude Vision parsea los datos fiscales.
  4. Se crea el cliente automatico en esa empresa y queda en 'pendiente de aprobar'
     para que el admin le ponga limite de credito, correo, etc.
  5. Devuelve confirmacion con los datos leidos.

No requiere login. Tiene rate limiting basico por IP.
"""
from datetime import datetime
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Cliente, Empresa
from app.integrations.anthropic_client import ClaudeClient

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/public/registro-cliente", tags=["registro-publico"])


@router.get("/{empresa_id}")
def info_empresa_publica(
    empresa_id: int,
    db: Session = Depends(get_db),
):
    """Datos basicos de la empresa para mostrar en el portal publico."""
    emp = db.get(Empresa, empresa_id)
    if not emp:
        raise HTTPException(404, "Empresa no encontrada")
    return {
        "empresa_id": emp.id,
        "nombre": emp.razon_social or emp.nombre,
        "rfc": emp.rfc,
    }


@router.post("/{empresa_id}/subir-csf")
async def subir_csf_publico(
    empresa_id: int,
    file: UploadFile = File(...),
    whatsapp: str | None = Form(None),
    correo: str | None = Form(None),
    uso_cfdi: str | None = Form(None),       # G03, G01, etc.
    metodo_pago: str | None = Form(None),    # PUE | PPD
    forma_pago: str | None = Form(None),     # 01, 03, etc.
    db: Session = Depends(get_db),
):
    """Portal publico: cliente sube su CSF y el sistema crea su registro.

    Si ya existe un cliente con ese RFC en la empresa, no se duplica —
    se actualizan sus datos de contacto (whatsapp/correo) si vienen.
    """
    emp = db.get(Empresa, empresa_id)
    if not emp:
        raise HTTPException(404, "Empresa no encontrada")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(400, "Archivo vacio")
    if len(file_bytes) > 10 * 1024 * 1024:  # 10 MB max
        raise HTTPException(413, "Archivo demasiado grande (max 10 MB)")

    filename = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()
    if filename.endswith(".pdf") or content_type == "application/pdf":
        mime = "application/pdf"
    elif content_type.startswith("image/") or filename.endswith((".png", ".jpg", ".jpeg", ".webp")):
        mime = content_type if content_type.startswith("image/") else (
            "image/png" if filename.endswith(".png") else
            "image/webp" if filename.endswith(".webp") else "image/jpeg"
        )
    else:
        raise HTTPException(400, f"Tipo de archivo no soportado: {filename}")

    try:
        datos = ClaudeClient().parsear_csf(file_bytes, mime_type=mime)
    except Exception as e:
        logger.exception("parsear_csf fallo en portal publico")
        raise HTTPException(500, f"No pude leer la Constancia: {e}")

    rfc = (datos.get("rfc") or "").strip().upper()
    if not rfc or len(rfc) not in (12, 13):
        raise HTTPException(400, "No encontre un RFC valido en la Constancia. ¿Puedes mandar foto mas nitida?")

    razon_social = (datos.get("razon_social") or "").strip().upper() or rfc
    cp = (datos.get("codigo_postal") or "").strip()
    regimen = (datos.get("regimen_fiscal") or "616").strip()

    # Normalizar contacto
    whatsapp_limpio = (whatsapp or "").strip() or None
    correo_limpio = (correo or "").strip() or None

    # ¿Ya existe cliente con ese RFC en esta empresa?
    existente = (
        db.query(Cliente)
        .filter(Cliente.empresa_id == empresa_id)
        .filter(Cliente.rfc == rfc)
        .first()
    )
    if existente:
        # Actualizar contacto si vino nuevo y antes no tenia
        actualizado = False
        if whatsapp_limpio and not existente.whatsapp:
            existente.whatsapp = whatsapp_limpio
            actualizado = True
        if correo_limpio and not existente.correo:
            existente.correo = correo_limpio
            actualizado = True
        if actualizado:
            db.commit()
        return {
            "ok": True, "nuevo": False,
            "cliente_id": existente.id,
            "rfc": rfc, "razon_social": existente.razon_social or existente.nombre,
            "mensaje": f"Ya estabas registrado con nosotros. Actualizamos tus datos de contacto." if actualizado
            else "Ya estabas registrado con nosotros.",
        }

    # Validar y aplicar preferencias (o defaults)
    uso_cfdi_final = (uso_cfdi or "G03").strip().upper()
    metodo_pago_final = (metodo_pago or "PUE").strip().upper()
    if metodo_pago_final not in ("PUE", "PPD"):
        metodo_pago_final = "PUE"
    forma_pago_final = (forma_pago or ("99" if metodo_pago_final == "PPD" else "03")).strip()

    # Crear nuevo cliente
    nuevo = Cliente(
        empresa_id=empresa_id,
        nombre=razon_social,
        razon_social=razon_social,
        rfc=rfc,
        regimen_fiscal=regimen,
        codigo_postal=cp or None,
        uso_cfdi_default=uso_cfdi_final,
        metodo_pago_default=metodo_pago_final,
        forma_pago_default=forma_pago_final,
        whatsapp=whatsapp_limpio,
        correo=correo_limpio,
        activo=True,
        notas=f"[AUTO-REGISTRO {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}] Cliente capturo su CSF via portal publico. Revisa limite credito.",
        creado_en=datetime.utcnow(),
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)

    logger.info(
        "Nuevo cliente auto-registrado via portal publico: empresa=%s rfc=%s id=%s",
        empresa_id, rfc, nuevo.id,
    )

    return {
        "ok": True, "nuevo": True,
        "cliente_id": nuevo.id,
        "rfc": rfc, "razon_social": razon_social,
        "regimen_fiscal": regimen, "codigo_postal": cp,
        "uso_cfdi": uso_cfdi_final,
        "metodo_pago": metodo_pago_final,
        "forma_pago": forma_pago_final,
        "mensaje": "¡Listo! Ya estas registrado. En tu proxima compra solo di tu RFC y podemos facturarte.",
    }
