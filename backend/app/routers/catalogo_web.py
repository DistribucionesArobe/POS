"""Endpoint publico para que sitios externos (ej. somoscpv.com) jalen
precio, stock e imagen de las variantes marcadas con `mostrar_en_web=True`.

Sin auth. Devuelve solo lo minimo necesario para pintar una tarjeta de producto.
Pensado para fetch directo desde el navegador (CORS abierto a GET).
"""
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Empresa
from app.models.producto import Producto, VarianteProducto

router = APIRouter(prefix="/public/catalogo-web", tags=["catalogo-web"])


def _nocache(response: Response, seconds: int = 60) -> None:
    # Cache corto en CDN/navegador: 1 min default. Suficiente para que al cambiar
    # precio en el POS se refleje casi en vivo sin pegarle a la DB en cada visita.
    response.headers["Cache-Control"] = f"public, max-age={seconds}"
    response.headers["Access-Control-Allow-Origin"] = "*"


@router.get("/{empresa_id}")
def catalogo_publico(
    empresa_id: int,
    response: Response,
    db: Session = Depends(get_db),
):
    """Devuelve TODAS las variantes de la empresa marcadas con mostrar_en_web=True."""
    emp = db.get(Empresa, empresa_id)
    if not emp:
        raise HTTPException(404, "Empresa no encontrada")

    rows = (
        db.query(VarianteProducto, Producto)
        .join(Producto, Producto.id == VarianteProducto.producto_id)
        .filter(Producto.empresa_id == empresa_id)
        .filter(VarianteProducto.mostrar_en_web == True)  # noqa: E712
        .filter(VarianteProducto.activo == True)  # noqa: E712
        .filter(Producto.activo == True)  # noqa: E712
        .order_by(Producto.categoria, Producto.marca, Producto.nombre)
        .all()
    )

    _nocache(response, seconds=60)
    return {
        "empresa": emp.nombre,
        "actualizado_en": None,  # el cliente usa su propia hora si quiere
        "productos": [
            {
                "id": v.id,
                "sku": v.sku,
                "nombre": p.nombre,
                "presentacion": v.presentacion,
                "marca": p.marca,
                "categoria": p.categoria,
                "descripcion": p.descripcion,
                "precio": float(v.precio_publico),
                "stock": float(v.stock_actual),
                "disponible": float(v.stock_actual) > 0,
                "unidad": v.unidad,
                "imagen_url": v.imagen_url,
            }
            for v, p in rows
        ],
    }
