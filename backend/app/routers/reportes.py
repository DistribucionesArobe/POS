"""Reportes operativos y financieros."""
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import DocumentoVenta, CuentaPorCobrar
from app.models.venta import EstatusDocumento

router = APIRouter()


@router.get("/corte-caja")
def corte_caja(fecha: date | None = None, db: Session = Depends(get_db)):
    f = fecha or date.today()
    inicio = datetime.combine(f, datetime.min.time())
    fin = inicio + timedelta(days=1)
    rows = (
        db.query(DocumentoVenta.tipo, func.count().label("n"), func.sum(DocumentoVenta.total).label("total"))
        .filter(DocumentoVenta.fecha >= inicio, DocumentoVenta.fecha < fin)
        .filter(DocumentoVenta.estatus != EstatusDocumento.CANCELADO.value)
        .group_by(DocumentoVenta.tipo)
        .all()
    )
    return {
        "fecha": f.isoformat(),
        "por_tipo": [{"tipo": t, "n": n, "total": float(total or 0)} for t, n, total in rows],
    }


@router.get("/antiguedad-cartera")
def antiguedad_cartera(db: Session = Depends(get_db)):
    """CxC agrupada por buckets de antiguedad."""
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


# TODO: ventas-por-vendedor, IVA-causado-vs-cobrado (PPD), kardex-valorizado, utilidad-por-producto
