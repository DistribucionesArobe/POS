"""Logica de inventario - el unico lugar que muta stock_actual."""
from sqlalchemy.orm import Session

from app.models import VarianteProducto, MovimientoInventario


def aplicar_movimiento(
    db: Session,
    variante_id: int,
    tipo: str,
    cantidad_signed: float,
    referencia_tipo: str | None = None,
    referencia_id: int | None = None,
    costo_unitario: float = 0,
    usuario_id: int | None = None,
    notas: str | None = None,
) -> MovimientoInventario:
    """Registra un movimiento Y actualiza stock_actual de forma transaccional.

    cantidad_signed: positiva para entradas, negativa para salidas.
    """
    variante = db.get(VarianteProducto, variante_id)
    if not variante:
        raise ValueError(f"Variante {variante_id} no existe")

    nuevo_stock = float(variante.stock_actual) + cantidad_signed
    if nuevo_stock < 0:
        raise ValueError(
            f"Stock insuficiente para variante {variante.sku}: "
            f"actual={variante.stock_actual}, requerido={-cantidad_signed}"
        )

    mov = MovimientoInventario(
        variante_id=variante_id,
        tipo=tipo,
        cantidad=cantidad_signed,
        costo_unitario=costo_unitario,
        referencia_tipo=referencia_tipo,
        referencia_id=referencia_id,
        usuario_id=usuario_id,
        notas=notas,
    )
    variante.stock_actual = nuevo_stock
    db.add(mov)
    db.flush()
    return mov


def transformar_entera_en_mitades(
    db: Session, variante_entera_id: int, cantidad_enteras: int, usuario_id: int | None = None
):
    """Saca N enteras y mete N*factor mitades."""
    entera = db.get(VarianteProducto, variante_entera_id)
    if not entera or not entera.derivada_id:
        raise ValueError("Variante no tiene derivada configurada")

    aplicar_movimiento(
        db, entera.id, "TRANSFORMACION_OUT", -cantidad_enteras,
        referencia_tipo="TRANSFORMACION", usuario_id=usuario_id,
    )
    aplicar_movimiento(
        db, entera.derivada_id, "TRANSFORMACION_IN",
        cantidad_enteras * entera.factor_division,
        referencia_tipo="TRANSFORMACION", usuario_id=usuario_id,
    )
