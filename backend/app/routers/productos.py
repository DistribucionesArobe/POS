"""Productos y variantes - CRUD."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import Producto, VarianteProducto
from app.schemas.producto import ProductoIn, ProductoSimpleIn, VarianteIn, PrecioUpdate

router = APIRouter()


@router.get("")
def listar_productos(
    q: str | None = Query(None),
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
            "id": p.id, "nombre": p.nombre, "categoria": p.categoria, "marca": p.marca,
            "descripcion": p.descripcion, "clave_prod_serv_sat": p.clave_prod_serv_sat,
            "variantes": [
                {
                    "id": v.id, "sku": v.sku, "presentacion": v.presentacion,
                    "unidad": v.unidad, "clave_unidad_sat": v.clave_unidad_sat,
                    "precio_publico": float(v.precio_publico),
                    "precio_mayoreo": float(v.precio_mayoreo) if v.precio_mayoreo else None,
                    "cantidad_mayoreo": v.cantidad_mayoreo,
                    "costo_promedio": float(v.costo_promedio),
                    "stock_actual": float(v.stock_actual),
                    "stock_minimo": float(v.stock_minimo),
                    "activo": v.activo,
                }
                for v in p.variantes
            ],
        }
        for p in query.order_by(Producto.nombre).all()
    ]


@router.get("/buscar-variante")
def buscar_variante(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
):
    like = f"%{q}%"
    rows = (
        db.query(VarianteProducto)
        .join(Producto)
        .filter(VarianteProducto.activo == True)
        .filter(or_(VarianteProducto.sku.ilike(like), Producto.nombre.ilike(like)))
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


@router.post("/simple")
def crear_producto_simple(payload: ProductoSimpleIn, db: Session = Depends(get_db)):
    """Crea producto + 1 variante de un solo golpe (caso comun)."""
    if db.query(VarianteProducto).filter(VarianteProducto.sku == payload.sku).first():
        raise HTTPException(400, f"SKU '{payload.sku}' ya existe")
    p = Producto(
        nombre=payload.nombre, categoria=payload.categoria, marca=payload.marca,
        clave_prod_serv_sat=payload.clave_prod_serv_sat,
    )
    db.add(p)
    db.flush()
    v = VarianteProducto(
        producto_id=p.id, sku=payload.sku, presentacion=payload.presentacion,
        unidad=payload.unidad, clave_unidad_sat=payload.clave_unidad_sat,
        precio_publico=payload.precio_publico, costo_promedio=payload.costo_promedio,
        stock_minimo=payload.stock_minimo,
    )
    db.add(v)
    db.commit()
    return {"producto_id": p.id, "variante_id": v.id, "sku": v.sku}


@router.post("")
def crear_producto(payload: ProductoIn, db: Session = Depends(get_db)):
    """Crear solo el producto (familia) sin variante. Para casos con multiples variantes."""
    p = Producto(**payload.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"id": p.id, "nombre": p.nombre}


@router.post("/variantes")
def crear_variante(payload: VarianteIn, db: Session = Depends(get_db)):
    if not db.get(Producto, payload.producto_id):
        raise HTTPException(404, "Producto no existe")
    if db.query(VarianteProducto).filter(VarianteProducto.sku == payload.sku).first():
        raise HTTPException(400, f"SKU '{payload.sku}' ya existe")
    v = VarianteProducto(**payload.model_dump())
    db.add(v)
    db.commit()
    db.refresh(v)
    return {"id": v.id, "sku": v.sku}


@router.patch("/variantes/{variante_id}/precio")
def actualizar_precio(variante_id: int, payload: PrecioUpdate, db: Session = Depends(get_db)):
    v = db.get(VarianteProducto, variante_id)
    if not v:
        raise HTTPException(404, "Variante no existe")
    v.precio_publico = payload.precio_publico
    v.precio_mayoreo = payload.precio_mayoreo
    db.commit()
    return {"ok": True, "precio_publico": float(v.precio_publico)}


@router.delete("/variantes/{variante_id}")
def desactivar_variante(variante_id: int, db: Session = Depends(get_db)):
    v = db.get(VarianteProducto, variante_id)
    if not v:
        raise HTTPException(404, "Variante no existe")
    v.activo = False
    db.commit()
    return {"ok": True}
