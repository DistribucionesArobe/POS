"""Productos y variantes."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import Producto, VarianteProducto

router = APIRouter()


@router.get("")
def listar_productos(
    q: str | None = Query(None, description="Busqueda por nombre/sku/categoria"),
    activo: bool = True,
    db: Session = Depends(get_db),
):
    query = db.query(Producto).options(joinedload(Producto.variantes))
    if activo:
        query = query.filter(Producto.activo == True)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Producto.nombre.ilike(like), Producto.categoria.ilike(like)))
    return [
        {
            "id": p.id,
            "nombre": p.nombre,
            "categoria": p.categoria,
            "marca": p.marca,
            "variantes": [
                {
                    "id": v.id, "sku": v.sku, "presentacion": v.presentacion,
                    "unidad": v.unidad, "precio_publico": float(v.precio_publico),
                    "stock_actual": float(v.stock_actual),
                }
                for v in p.variantes if v.activo
            ],
        }
        for p in query.limit(200).all()
    ]


@router.get("/buscar-variante")
def buscar_variante(
    q: str = Query(..., min_length=2, description="Busqueda por SKU o descripcion"),
    db: Session = Depends(get_db),
):
    """Endpoint para autocomplete del cajero."""
    like = f"%{q}%"
    rows = (
        db.query(VarianteProducto)
        .join(Producto)
        .filter(VarianteProducto.activo == True)
        .filter(or_(
            VarianteProducto.sku.ilike(like),
            Producto.nombre.ilike(like),
        ))
        .limit(20)
        .all()
    )
    return [
        {
            "id": v.id, "sku": v.sku,
            "nombre": f"{v.producto.nombre} - {v.presentacion}",
            "precio": float(v.precio_publico),
            "stock": float(v.stock_actual),
            "unidad": v.unidad,
        }
        for v in rows
    ]


# TODO: POST /productos, PUT /productos/{id}, POST /variantes, etc.
