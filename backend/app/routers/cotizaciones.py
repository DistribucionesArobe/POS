"""Cotizaciones - se pueden enviar por WhatsApp y convertir en venta."""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db, SessionLocal
from app.models import (
    Cotizacion, Cliente, VarianteProducto, Producto, Empresa,
    DocumentoVenta,
)
from app.models.venta import TipoDocumento
from app.services.security import get_active_empresa_id
from app.services import venta_service
from app.schemas.venta import DocumentoVentaIn, ConceptoVentaIn

router = APIRouter()

IVA_TASA = 0.16


class ConceptoCotIn(BaseModel):
    variante_id: int
    cantidad: float = Field(gt=0)
    precio_unitario: float = Field(ge=0)
    descripcion: str | None = None


class CotizacionIn(BaseModel):
    cliente_id: int | None = None
    nombre_libre: str | None = None
    whatsapp_origen: str | None = None
    vigencia_dias: int = 15
    conceptos: list[ConceptoCotIn]
    notas: str | None = None


class ConvertirIn(BaseModel):
    tipo: str  # TICKET | REMISION | FACTURA
    cliente_id: int | None = None  # si la cotizacion no tenia cliente


def _folio_cot(db: Session, empresa_id: int) -> str:
    n = db.query(func.count(Cotizacion.id)).filter(Cotizacion.empresa_id == empresa_id).scalar() or 0
    return f"E{empresa_id}-COT-{n + 1:06d}"


def _calcular_totales(conceptos: list, db: Session, empresa_id: int) -> tuple[float, float, float, list]:
    subtotal = 0.0
    enriched = []
    for c in conceptos:
        v = db.get(VarianteProducto, c.variante_id)
        if not v:
            raise HTTPException(400, f"Variante {c.variante_id} no existe")
        prod = db.get(Producto, v.producto_id)
        if prod.empresa_id != empresa_id:
            raise HTTPException(403, "Variante de otra empresa")
        importe = round(c.cantidad * c.precio_unitario, 2)
        subtotal += importe
        enriched.append({
            "variante_id": v.id,
            "sku": v.sku,
            "descripcion": c.descripcion or f"{prod.nombre} - {v.presentacion}",
            "unidad": v.unidad,
            "cantidad": c.cantidad,
            "precio_unitario": c.precio_unitario,
            "importe": importe,
        })
    iva = round(subtotal * IVA_TASA, 2)
    total = round(subtotal + iva, 2)
    return subtotal, iva, total, enriched


@router.post("")
def crear_cotizacion(
    payload: CotizacionIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    if payload.cliente_id:
        cli = db.get(Cliente, payload.cliente_id)
        if not cli or cli.empresa_id != empresa_id:
            raise HTTPException(400, "Cliente invalido")
    subtotal, iva, total, items = _calcular_totales(payload.conceptos, db, empresa_id)
    cot = Cotizacion(
        empresa_id=empresa_id,
        folio=_folio_cot(db, empresa_id),
        cliente_id=payload.cliente_id,
        nombre_libre=payload.nombre_libre,
        whatsapp_origen=payload.whatsapp_origen,
        fecha=datetime.utcnow(),
        vigencia_hasta=datetime.utcnow() + timedelta(days=payload.vigencia_dias),
        conceptos=items,
        subtotal=subtotal, iva=iva, total=total,
        estatus="ENVIADA",
        notas=payload.notas,
    )
    db.add(cot)
    db.commit()
    db.refresh(cot)
    return {"id": cot.id, "folio": cot.folio, "total": float(cot.total)}


@router.get("")
def listar_cotizaciones(
    estatus: str | None = None,
    limit: int = 50,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    q = db.query(Cotizacion).filter(Cotizacion.empresa_id == empresa_id)
    if estatus:
        q = q.filter(Cotizacion.estatus == estatus)
    rows = q.order_by(Cotizacion.fecha.desc()).limit(limit).all()
    out = []
    for c in rows:
        cli = db.get(Cliente, c.cliente_id) if c.cliente_id else None
        out.append({
            "id": c.id, "folio": c.folio,
            "fecha": c.fecha.isoformat(),
            "vigencia_hasta": c.vigencia_hasta.isoformat() if c.vigencia_hasta else None,
            "cliente_id": c.cliente_id,
            "cliente_nombre": cli.nombre if cli else (c.nombre_libre or "Cliente libre"),
            "whatsapp_origen": c.whatsapp_origen,
            "total": float(c.total),
            "estatus": c.estatus,
            "documento_venta_id": c.documento_venta_id,
            "n_conceptos": len(c.conceptos or []),
        })
    return out


@router.get("/{cot_id}")
def obtener_cotizacion(
    cot_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    c = db.get(Cotizacion, cot_id)
    if not c or c.empresa_id != empresa_id:
        raise HTTPException(404, "Cotizacion no existe")
    cli = db.get(Cliente, c.cliente_id) if c.cliente_id else None
    emp = db.get(Empresa, c.empresa_id)
    return {
        "id": c.id, "folio": c.folio,
        "fecha": c.fecha.isoformat(),
        "vigencia_hasta": c.vigencia_hasta.isoformat() if c.vigencia_hasta else None,
        "cliente_id": c.cliente_id,
        "cliente_nombre": cli.nombre if cli else (c.nombre_libre or "Cliente libre"),
        "cliente_razon_social": cli.razon_social if cli else None,
        "cliente_rfc": cli.rfc if cli else None,
        "cliente_cp": cli.codigo_postal if cli else None,
        "cliente_regimen": cli.regimen_fiscal if cli else None,
        "cliente_telefono": cli.telefono if cli else None,
        "cliente_whatsapp": (cli.whatsapp if cli else c.whatsapp_origen),
        "empresa_nombre": emp.nombre if emp else "",
        "subtotal": float(c.subtotal),
        "iva": float(c.iva),
        "total": float(c.total),
        "conceptos": c.conceptos or [],
        "estatus": c.estatus,
        "documento_venta_id": c.documento_venta_id,
        "notas": c.notas,
    }


@router.delete("/{cot_id}")
def cancelar_cotizacion(
    cot_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    c = db.get(Cotizacion, cot_id)
    if not c or c.empresa_id != empresa_id:
        raise HTTPException(404, "Cotizacion no existe")
    if c.documento_venta_id:
        raise HTTPException(400, "Ya fue convertida en venta, no se puede cancelar")
    c.estatus = "CANCELADA"
    db.commit()
    return {"ok": True}


@router.post("/{cot_id}/convertir")
def convertir_a_venta(
    cot_id: int,
    payload: ConvertirIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    c = db.get(Cotizacion, cot_id)
    if not c or c.empresa_id != empresa_id:
        raise HTTPException(404, "Cotizacion no existe")
    if c.documento_venta_id:
        raise HTTPException(400, "Esta cotizacion ya se convirtio en venta")
    cliente_id = payload.cliente_id or c.cliente_id
    if not cliente_id:
        raise HTTPException(400, "Falta cliente_id (la cotizacion no tiene cliente registrado)")

    # Validar tipo y campos minimos segun tipo
    if payload.tipo not in (TipoDocumento.TICKET.value, TipoDocumento.REMISION.value, TipoDocumento.FACTURA.value):
        raise HTTPException(400, "tipo invalido")

    cli = db.get(Cliente, cliente_id)
    if payload.tipo == TipoDocumento.FACTURA.value and not (cli and cli.rfc):
        raise HTTPException(400, "Para FACTURA el cliente debe tener RFC")

    # Construir DocumentoVentaIn
    doc_payload = DocumentoVentaIn(
        tipo=payload.tipo,
        cliente_id=cliente_id,
        forma_pago_sat="03" if payload.tipo == TipoDocumento.FACTURA.value else "01",
        metodo_pago_sat="PPD" if payload.tipo == TipoDocumento.REMISION.value else "PUE",
        uso_cfdi=cli.uso_cfdi_default if cli else None,
        notas=f"Convertida de cotizacion {c.folio}",
        conceptos=[
            ConceptoVentaIn(
                variante_id=it["variante_id"],
                cantidad=it["cantidad"],
                precio_unitario=it["precio_unitario"],
            )
            for it in (c.conceptos or [])
        ],
    )
    try:
        doc = venta_service.crear_documento(db, doc_payload, empresa_id)
    except ValueError as e:
        raise HTTPException(400, str(e))

    c.documento_venta_id = doc.id
    c.estatus = "CONVERTIDA"
    db.commit()
    return {
        "ok": True,
        "venta_id": doc.id,
        "folio": doc.folio,
        "total": float(doc.total),
    }


@router.get("/{cot_id}/pdf")
def pdf_cotizacion(
    cot_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    from app.services.pdf_service import generar_pdf_cotizacion
    c = db.get(Cotizacion, cot_id)
    if not c or c.empresa_id != empresa_id:
        raise HTTPException(404, "Cotizacion no existe")
    cli = db.get(Cliente, c.cliente_id) if c.cliente_id else None
    emp = db.get(Empresa, empresa_id)
    pdf = generar_pdf_cotizacion(c, cli, emp)
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={c.folio}.pdf"},
    )


# === Endpoints publicos (para WhatsApp): no auth, busca por folio ===
@router.get("/publica/{folio}")
def cotizacion_publica(folio: str):
    db = SessionLocal()
    try:
        c = db.query(Cotizacion).filter(Cotizacion.folio == folio).first()
        if not c:
            raise HTTPException(404, "Cotizacion no encontrada")
        emp = db.get(Empresa, c.empresa_id)
        cli = db.get(Cliente, c.cliente_id) if c.cliente_id else None
        return {
            "folio": c.folio,
            "fecha": c.fecha.isoformat(),
            "vigencia_hasta": c.vigencia_hasta.isoformat() if c.vigencia_hasta else None,
            "emisor": {"nombre": emp.nombre, "razon_social": emp.razon_social, "rfc": emp.rfc},
            "cliente": (cli.nombre if cli else None) or c.nombre_libre or "Cliente",
            "conceptos": c.conceptos or [],
            "subtotal": float(c.subtotal),
            "iva": float(c.iva),
            "total": float(c.total),
            "estatus": c.estatus,
            "notas": c.notas,
        }
    finally:
        db.close()


@router.get("/publica/{folio}/pdf")
def cotizacion_publica_pdf(folio: str):
    """Sirve el PDF de la cotizacion sin requerir login (para WhatsApp / cliente final)."""
    from app.services.pdf_service import generar_pdf_cotizacion
    db = SessionLocal()
    try:
        c = db.query(Cotizacion).filter(Cotizacion.folio == folio).first()
        if not c:
            raise HTTPException(404, "Cotizacion no encontrada")
        cli = db.get(Cliente, c.cliente_id) if c.cliente_id else None
        emp = db.get(Empresa, c.empresa_id)
        pdf = generar_pdf_cotizacion(c, cli, emp)
        return Response(
            content=pdf, media_type="application/pdf",
            headers={"Content-Disposition": f"inline; filename={c.folio}.pdf"},
        )
    finally:
        db.close()
