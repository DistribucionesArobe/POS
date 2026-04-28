"""Kardex / movimientos de inventario.

TODA modificacion de stock pasa por aqui (entrada, salida, transformacion,
ajuste). El stock_actual de la variante es el resultado de SUM(cantidad).
"""
from datetime import datetime
from enum import Enum
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Text, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class TipoMovimiento(str, Enum):
    ENTRADA_COMPRA = "ENTRADA_COMPRA"
    SALIDA_VENTA = "SALIDA_VENTA"
    SALIDA_REMISION = "SALIDA_REMISION"
    DEVOLUCION_VENTA = "DEVOLUCION_VENTA"
    DEVOLUCION_COMPRA = "DEVOLUCION_COMPRA"
    TRANSFORMACION_OUT = "TRANSFORMACION_OUT"  # sale la pieza entera
    TRANSFORMACION_IN = "TRANSFORMACION_IN"   # entran las mitades
    AJUSTE_POSITIVO = "AJUSTE_POSITIVO"
    AJUSTE_NEGATIVO = "AJUSTE_NEGATIVO"
    MERMA = "MERMA"


class MovimientoInventario(Base):
    __tablename__ = "movimientos_inventario"
    __table_args__ = (
        Index("ix_mov_variante_fecha", "variante_id", "fecha"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    variante_id: Mapped[int] = mapped_column(
        ForeignKey("variantes_producto.id"), index=True
    )
    tipo: Mapped[str] = mapped_column(String(32))  # TipoMovimiento
    cantidad: Mapped[float] = mapped_column(Numeric(14, 4))  # firmada (+ entrada / - salida)
    costo_unitario: Mapped[float] = mapped_column(Numeric(14, 4), default=0)
    fecha: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    # Documento que origino el movimiento (polimorfico por convencion)
    # Ejemplo: ("DOCUMENTO_VENTA", 123) o ("COMPRA", 45)
    referencia_tipo: Mapped[str | None] = mapped_column(String(32), nullable=True)
    referencia_id: Mapped[int | None] = mapped_column(nullable=True)

    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
