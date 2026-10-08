"""Conteo fisico de inventario: lista productos, captura conteo, ajusta diferencias."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from app.db import get_db
from app.models import (
    ConteoInventario, ConteoInventarioItem,
    Producto, VarianteProducto, MovimientoInventario, Usuario,
)
from app.services.security import get_active_empresa_id, get_current_user

router = APIRouter(prefix="/conteo-inventario", tags=["conteo-inventario"])


@router.get("/plantilla")
def plantilla(
    categoria: str | None = None,
    busqueda: str | None = None,
    solo_con_stock: bool = False,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Devuelve lista de productos activos agrupados por categoria con stock actual.
    Usado para plantilla imprimible y para captura digital."""
    q = (
        db.query(VarianteProducto, Producto)
        .join(Producto, Producto.id == VarianteProducto.producto_id)
        .filter(Producto.empresa_id == empresa_id)
        .filter(Producto.activo == True)
        .filter(VarianteProducto.activo == True)
    )
    if categoria:
        q = q.filter(Producto.categoria == categoria)
    if busqueda:
        like = f"%{busqueda}%"
        q = q.filter(or_(
            Producto.nombre.ilike(like),
            VarianteProducto.sku.ilike(like),
        ))
    if solo_con_stock:
        q = q.filter(VarianteProducto.stock_actual > 0)

    rows = q.order_by(Producto.categoria, Producto.nombre).all()

    # Agrupar por categoria
    grupos: dict[str, list] = {}
    for v, p in rows:
        cat = p.categoria or "Sin categoría"
        grupos.setdefault(cat, []).append({
            "variante_id": v.id,
            "producto_id": p.id,
            "nombre": p.nombre,
            "sku": v.sku,
            "presentacion": v.presentacion,
            "unidad": v.unidad,
            "stock_sistema": float(v.stock_actual or 0),
            "costo_unit": float(v.costo_promedio or 0),
        })

    return {
        "categorias": sorted(grupos.keys()),
        "grupos": [{"categoria": cat, "items": items} for cat, items in sorted(grupos.items())],
        "total_items": len(rows),
    }


@router.get("/categorias")
def listar_categorias(
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Lista todas las categorias presentes en los productos activos."""
    rows = (
        db.query(Producto.categoria, func.count(Producto.id))
        .filter(Producto.empresa_id == empresa_id)
        .filter(Producto.activo == True)
        .filter(Producto.categoria.isnot(None))
        .group_by(Producto.categoria)
        .order_by(Producto.categoria)
        .all()
    )
    return [{"categoria": r[0], "n_productos": r[1]} for r in rows]


class ItemConteoIn(BaseModel):
    variante_id: int
    stock_contado: float
    notas: str | None = None


class RegistrarConteoIn(BaseModel):
    categoria_filtro: str | None = None
    busqueda_filtro: str | None = None
    notas: str | None = None
    items: list[ItemConteoIn]
    aplicar_ajustes: bool = True  # si false, solo guarda log sin modificar stock


@router.post("/registrar")
def registrar_conteo(
    payload: RegistrarConteoIn,
    empresa_id: int = Depends(get_active_empresa_id),
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Procesa el conteo: crea registro, aplica ajustes a inventario."""
    if not payload.items:
        raise HTTPException(400, "El conteo debe tener al menos 1 item")

    conteo = ConteoInventario(
        empresa_id=empresa_id,
        usuario_id=usuario.id,
        categoria_filtro=payload.categoria_filtro,
        busqueda_filtro=payload.busqueda_filtro,
        notas=payload.notas,
        aplicado=payload.aplicar_ajustes,
    )
    db.add(conteo)
    db.flush()

    n_con_diferencia = 0
    valor_total = 0.0

    for it in payload.items:
        var = db.get(VarianteProducto, it.variante_id)
        if not var:
            continue
        prod = db.get(Producto, var.producto_id)
        if not prod or prod.empresa_id != empresa_id:
            continue

        stock_antes = float(var.stock_actual or 0)
        diferencia = it.stock_contado - stock_antes
        costo = float(var.costo_promedio or 0)
        valor_dif = round(diferencia * costo, 2)

        item = ConteoInventarioItem(
            conteo_id=conteo.id,
            variante_id=var.id,
            stock_sistema=stock_antes,
            stock_contado=it.stock_contado,
            diferencia=diferencia,
            costo_unit=costo,
            valor_diferencia=valor_dif,
            notas=it.notas,
        )
        db.add(item)

        if abs(diferencia) > 0.0001:
            n_con_diferencia += 1
            valor_total += valor_dif
            if payload.aplicar_ajustes:
                var.stock_actual = it.stock_contado
                db.add(MovimientoInventario(
                    variante_id=var.id,
                    tipo="AJUSTE",
                    cantidad=abs(diferencia),
                    referencia=f"Conteo fisico #{conteo.id} ({'faltante' if diferencia < 0 else 'sobrante'})",
                    fecha=datetime.utcnow(),
                ))

    conteo.total_items_contados = len(payload.items)
    conteo.total_items_con_diferencia = n_con_diferencia
    conteo.valor_ajuste_total = valor_total
    db.commit()

    return {
        "ok": True,
        "conteo_id": conteo.id,
        "total_items": conteo.total_items_contados,
        "con_diferencia": conteo.total_items_con_diferencia,
        "valor_ajuste": float(conteo.valor_ajuste_total),
        "aplicado": conteo.aplicado,
    }


@router.get("/historial")
def listar_historial(
    limit: int = 30,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ConteoInventario)
        .filter(ConteoInventario.empresa_id == empresa_id)
        .order_by(ConteoInventario.fecha.desc())
        .limit(limit).all()
    )
    return [{
        "id": c.id,
        "fecha": c.fecha.isoformat(),
        "categoria": c.categoria_filtro,
        "total_items": c.total_items_contados,
        "con_diferencia": c.total_items_con_diferencia,
        "valor_ajuste": float(c.valor_ajuste_total),
        "aplicado": c.aplicado,
        "notas": c.notas,
    } for c in rows]


@router.get("/{conteo_id}")
def obtener_conteo(
    conteo_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    c = db.get(ConteoInventario, conteo_id)
    if not c or c.empresa_id != empresa_id:
        raise HTTPException(404, "Conteo no existe")
    items_resp = []
    for it in c.items:
        var = db.get(VarianteProducto, it.variante_id)
        prod = db.get(Producto, var.producto_id) if var else None
        items_resp.append({
            "variante_id": it.variante_id,
            "nombre": prod.nombre if prod else "?",
            "sku": var.sku if var else "?",
            "categoria": prod.categoria if prod else None,
            "stock_sistema": float(it.stock_sistema),
            "stock_contado": float(it.stock_contado),
            "diferencia": float(it.diferencia),
            "valor_diferencia": float(it.valor_diferencia),
        })
    return {
        "id": c.id, "fecha": c.fecha.isoformat(),
        "categoria": c.categoria_filtro,
        "total_items": c.total_items_contados,
        "con_diferencia": c.total_items_con_diferencia,
        "valor_ajuste": float(c.valor_ajuste_total),
        "aplicado": c.aplicado, "notas": c.notas,
        "items": items_resp,
    }
