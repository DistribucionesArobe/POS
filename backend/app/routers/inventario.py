"""Inventario y kardex - filtrado por empresa."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import VarianteProducto, MovimientoInventario, Producto
from app.services.security import get_active_empresa_id

router = APIRouter()


@router.get("/stock")
def stock_actual(
    bajo_minimo: bool = False,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    query = (
        db.query(VarianteProducto)
        .join(Producto)
        .filter(Producto.empresa_id == empresa_id)
        .filter(VarianteProducto.activo == True)
    )
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
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    v = db.get(VarianteProducto, variante_id)
    if not v:
        raise HTTPException(404, "Variante no existe")
    producto = db.get(Producto, v.producto_id)
    if producto.empresa_id != empresa_id:
        raise HTTPException(403, "Variante de otra empresa")
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
