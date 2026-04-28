"""Inventario y kardex."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import VarianteProducto, MovimientoInventario

router = APIRouter()


@router.get("/stock")
def stock_actual(
    bajo_minimo: bool = False,
    db: Session = Depends(get_db),
):
    query = db.query(VarianteProducto).filter(VarianteProducto.activo == True)
    if bajo_minimo:
        query = query.filter(VarianteProducto.stock_actual <= VarianteProducto.stock_minimo)
    return [
        {
            "variante_id": v.id, "sku": v.sku,
            "stock": float(v.stock_actual), "minimo": float(v.stock_minimo),
        }
        for v in query.all()
    ]


@router.get("/kardex/{variante_id}")
def kardex_de_variante(
    variante_id: int,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(MovimientoInventario)
        .filter(MovimientoInventario.variante_id == variante_id)
        .order_by(MovimientoInventario.fecha.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": m.id, "tipo": m.tipo, "cantidad": float(m.cantidad),
            "fecha": m.fecha.isoformat(), "ref": f"{m.referencia_tipo}:{m.referencia_id}",
        }
        for m in rows
    ]


# TODO: POST /ajuste, POST /transformacion (entera -> mitades), POST /merma
