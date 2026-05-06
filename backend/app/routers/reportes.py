"""Reportes operativos y financieros."""
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    DocumentoVenta, CuentaPorCobrar, VarianteProducto, Cliente,
)
from app.models.venta import EstatusDocumento

router = APIRouter()


@router.get("/kpis")
def kpis(db: Session = Depends(get_db)):
    """KPIs del dashboard: stock, ventas hoy, cartera total, clientes."""
    today = datetime.utcnow().date()
    inicio = datetime.combine(today, datetime.min.time())
    fin = inicio + timedelta(days=1)

    productos_stock = (
        db.query(VarianteProducto)
        .filter(VarianteProducto.activo == True, VarianteProducto.stock_actual > 0)
        .count()
    )

    ventas_hoy = db.query(
        func.coalesce(func.sum(DocumentoVenta.total), 0)
    ).filter(
        DocumentoVenta.fecha >= inicio,
        DocumentoVenta.fecha < fin,
        DocumentoVenta.estatus != EstatusDocumento.CANCELADO.value,
    ).scalar()

    docs_hoy = db.query(DocumentoVenta).filter(
        DocumentoVenta.fecha >= inicio,
        DocumentoVenta.fecha < fin,
        DocumentoVenta.estatus != EstatusDocumento.CANCELADO.value,
    ).count()

    cartera = db.query(
        func.coalesce(func.sum(CuentaPorCobrar.saldo), 0)
    ).filter(CuentaPorCobrar.pagado == False).scalar()

    docs_pendientes = db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.pagado == False
    ).count()

    clientes_activos = db.query(Cliente).filter(Cliente.activo == True).count()

    return {
        "productos_stock": productos_stock,
        "ventas_hoy": float(ventas_hoy or 0),
        "documentos_hoy": docs_hoy,
        "cartera_total": float(cartera or 0),
        "documentos_pendientes": docs_pendientes,
        "clientes_activos": clientes_activos,
    }


@router.get("/corte-caja")
def corte_caja(fecha: date | None = None, db: Session = Depends(get_db)):
    f = fecha or datetime.utcnow().date()
    inicio = datetime.combine(f, datetime.min.time())
    fin = inicio + timedelta(days=1)
    rows = (
        db.query(
            DocumentoVenta.tipo,
            func.count().label("n"),
            func.sum(DocumentoVenta.total).label("total"),
        )
        .filter(DocumentoVenta.fecha >= inicio, DocumentoVenta.fecha < fin)
        .filter(DocumentoVenta.estatus != EstatusDocumento.CANCELADO.value)
        .group_by(DocumentoVenta.tipo)
        .all()
    )
    return {
        "fecha": f.isoformat(),
        "por_tipo": [
            {"tipo": t, "n": n, "total": float(total or 0)}
            for t, n, total in rows
        ],
    }


@router.get("/antiguedad-cartera")
def antiguedad_cartera(db: Session = Depends(get_db)):
    today = datetime.utcnow().date()
    buckets = {"0-15": 0.0, "16-30": 0.0, "31-60": 0.0, "61-90": 0.0, "91+": 0.0}
    for cxc in db.query(CuentaPorCobrar).filter(CuentaPorCobrar.pagado == False).all():
        d = (today - cxc.fecha_emision.date()).days
        saldo = float(cxc.saldo)
        if d <= 15: buckets["0-15"] += saldo
        elif d <= 30: buckets["16-30"] += saldo
        elif d <= 60: buckets["31-60"] += saldo
        elif d <= 90: buckets["61-90"] += saldo
        else: buckets["91+"] += saldo
    return buckets
