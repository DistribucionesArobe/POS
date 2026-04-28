"""Ventas: ticket, remision, factura.

Endpoint principal POST /ventas para crear documentos. Toda la logica de
inventario, CxC y CFDI esta en services/.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import DocumentoVenta
from app.models.venta import TipoDocumento, EstatusDocumento
from app.schemas.venta import DocumentoVentaIn, DocumentoVentaOut
from app.services import venta_service

router = APIRouter()


@router.post("", response_model=DocumentoVentaOut)
def crear_venta(payload: DocumentoVentaIn, db: Session = Depends(get_db)):
    """Crea ticket | remision | factura. Descuenta inventario y arma CxC si aplica."""
    return venta_service.crear_documento(db, payload)


@router.get("")
def listar_ventas(
    tipo: str | None = Query(None),
    cliente_id: int | None = None,
    estatus: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    q = db.query(DocumentoVenta).options(joinedload(DocumentoVenta.conceptos))
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
def remisiones_pendientes_facturar(cliente_id: int, db: Session = Depends(get_db)):
    """Lista remisiones de un cliente que aun no se consolidan en factura.

    Esto alimenta el modelo B (factura global por consolidacion).
    """
    rows = (
        db.query(DocumentoVenta)
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
    db: Session = Depends(get_db),
):
    """Toma N remisiones y emite UNA factura CFDI 4.0 que las consolida."""
    return venta_service.consolidar_remisiones(db, cliente_id, remision_ids)
