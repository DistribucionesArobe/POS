"""Ventas: ticket, remision, factura - filtrado por empresa."""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import DocumentoVenta, Cliente, Empresa, Pago
from app.models.venta import TipoDocumento, EstatusDocumento
from app.schemas.venta import DocumentoVentaIn, DocumentoVentaOut, DevolucionIn
from app.services import venta_service, pdf_service
from app.services.security import get_active_empresa_id

router = APIRouter()


@router.post("", response_model=DocumentoVentaOut)
def crear_venta(
    payload: DocumentoVentaIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    try:
        return venta_service.crear_documento(db, payload, empresa_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("")
def listar_ventas(
    tipo: str | None = Query(None),
    cliente_id: int | None = None,
    estatus: str | None = None,
    limit: int = 50,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    q = db.query(DocumentoVenta).filter(DocumentoVenta.empresa_id == empresa_id).options(joinedload(DocumentoVenta.conceptos))
    if tipo: q = q.filter(DocumentoVenta.tipo == tipo)
    if cliente_id: q = q.filter(DocumentoVenta.cliente_id == cliente_id)
    if estatus: q = q.filter(DocumentoVenta.estatus == estatus)
    return [
        {
            "id": d.id, "folio": d.folio, "tipo": d.tipo, "estatus": d.estatus,
            "cliente_id": d.cliente_id, "fecha": d.fecha.isoformat(),
            "total": float(d.total),
        }
        for d in q.order_by(DocumentoVenta.fecha.desc()).limit(limit).all()
    ]


@router.get("/remisiones-pendientes/{cliente_id}")
def remisiones_pendientes_facturar(
    cliente_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(DocumentoVenta)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .filter(DocumentoVenta.cliente_id == cliente_id)
        .filter(DocumentoVenta.tipo == TipoDocumento.REMISION.value)
        .filter(DocumentoVenta.factura_padre_id.is_(None))
        .filter(DocumentoVenta.estatus != EstatusDocumento.CANCELADO.value)
        .order_by(DocumentoVenta.fecha)
        .all()
    )
    return [
        {"id": r.id, "folio": r.folio, "fecha": r.fecha.isoformat(), "total": float(r.total)}
        for r in rows
    ]


@router.post("/consolidar-factura")
def consolidar_remisiones_en_factura(
    cliente_id: int,
    remision_ids: list[int],
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    try:
        return venta_service.consolidar_remisiones(db, cliente_id, remision_ids, empresa_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/{documento_id}/conceptos")
def conceptos_de_documento(
    documento_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    doc = (
        db.query(DocumentoVenta)
        .options(joinedload(DocumentoVenta.conceptos))
        .filter(DocumentoVenta.id == documento_id)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .first()
    )
    if not doc:
        raise HTTPException(404, "Documento no existe")
    return [
        {
            "id": c.id, "variante_id": c.variante_id,
            "descripcion": c.descripcion,
            "cantidad": float(c.cantidad),
            "precio_unitario": float(c.precio_unitario),
            "importe": float(c.importe),
        }
        for c in doc.conceptos
    ]


@router.get("/{documento_id}/pagos")
def pagos_de_documento(
    documento_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    doc = (
        db.query(DocumentoVenta)
        .filter(DocumentoVenta.id == documento_id)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .first()
    )
    if not doc:
        raise HTTPException(404, "Documento no existe")
    pagos = db.query(Pago).filter(Pago.documento_venta_id == documento_id).order_by(Pago.id).all()
    return [
        {
            "id": p.id, "forma_pago_sat": p.forma_pago_sat,
            "monto": float(p.monto), "referencia": p.referencia,
        }
        for p in pagos
    ]


@router.post("/devolucion")
def crear_devolucion(
    payload: DevolucionIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Crea NOTA_CREDITO desde una factura. Devuelve inventario y reduce CxC."""
    try:
        nc = venta_service.crear_devolucion(
            db, payload.factura_id,
            [{"variante_id": c.variante_id, "cantidad": c.cantidad} for c in payload.conceptos],
            payload.motivo, empresa_id,
        )
        result = {
            "id": nc.id, "folio": nc.folio, "total": float(nc.total),
            "factura_relacionada_id": nc.factura_relacionada_id,
        }
        # Opcional: timbrar CFDI Egreso si el usuario lo pidio
        if payload.timbrar_cfdi_egreso:
            try:
                from app.services import cfdi_service
                cfdi_result = cfdi_service.emitir_nota_credito_cfdi(db, nc.id, empresa_id)
                result["cfdi"] = cfdi_result
            except Exception as e:
                result["cfdi_error"] = str(e)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/{documento_id}/pdf")
def descargar_pdf(
    documento_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    doc = (
        db.query(DocumentoVenta)
        .options(joinedload(DocumentoVenta.conceptos))
        .filter(DocumentoVenta.id == documento_id)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .first()
    )
    if not doc:
        raise HTTPException(404, "Documento no existe")
    cliente = db.get(Cliente, doc.cliente_id)
    empresa = db.get(Empresa, doc.empresa_id)
    pdf_bytes = pdf_service.generar_pdf_documento(doc, cliente, empresa)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={doc.folio}.pdf"},
    )
