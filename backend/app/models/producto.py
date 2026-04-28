"""Productos y sus variantes (ej. varilla 3/8 entera vs mitad).

Decision de diseno: en vez de tener cortes a medida con sobrantes, Aceromax
maneja piezas completas y mitades. Cada uno es una variante de SKU con
su propio stock. Las transformaciones (1 entera -> 2 mitades) se registran
como movimientos de inventario tipo TRANSFORMACION.
"""
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Numeric, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Producto(Base):
    """Producto canonico (familia). Ejemplo: Varilla corrugada 3/8."""
    __tablename__ = "productos"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(255), index=True)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    categoria: Mapped[str | None] = mapped_column(String(120), index=True, nullable=True)
    marca: Mapped[str | None] = mapped_column(String(120), nullable=True)

    # Catalogos SAT para CFDI
    clave_prod_serv_sat: Mapped[str | None] = mapped_column(String(8), nullable=True)
    objeto_impuesto_sat: Mapped[str] = mapped_column(String(2), default="02")  # 02 = Si objeto

    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    variantes: Mapped[list["VarianteProducto"]] = relationship(
        back_populates="producto",
        cascade="all, delete-orphan",
    )


class VarianteProducto(Base):
    """SKU especifico que se vende (entera, mitad, presentacion).

    El stock vive aqui. Cada variante tiene su propio precio y costo
    promedio actualizado por las compras.
    """
    __tablename__ = "variantes_producto"

    id: Mapped[int] = mapped_column(primary_key=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("productos.id", ondelete="CASCADE"))
    sku: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    # Presentacion: ENTERA, MITAD, BULTO_25KG, etc. Texto libre con convencion.
    presentacion: Mapped[str] = mapped_column(String(64))

    # Unidad de medida y catalogo SAT
    unidad: Mapped[str] = mapped_column(String(32))  # PZA, KG, M, BULTO
    clave_unidad_sat: Mapped[str] = mapped_column(String(3), default="H87")  # H87 = Pieza

    # Precios
    precio_publico: Mapped[float] = mapped_column(Numeric(14, 4), default=0)
    precio_mayoreo: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    cantidad_mayoreo: Mapped[int] = mapped_column(default=0)

    # Costo promedio - se recalcula con cada compra (promedio ponderado)
    costo_promedio: Mapped[float] = mapped_column(Numeric(14, 4), default=0)

    # Inventario - se actualiza por triggers/servicio desde MovimientoInventario
    stock_actual: Mapped[float] = mapped_column(Numeric(14, 4), default=0)
    stock_minimo: Mapped[float] = mapped_column(Numeric(14, 4), default=0)

    # Si esta variante es subdivisible, apunta a la variante hija (la mitad)
    # Ejemplo: variante "Varilla 3/8 entera" -> derivada_id apunta a "Varilla 3/8 mitad"
    derivada_id: Mapped[int | None] = mapped_column(
        ForeignKey("variantes_producto.id"), nullable=True
    )
    factor_division: Mapped[int] = mapped_column(default=1)  # 1 entera = N derivadas

    activo: Mapped[bool] = mapped_column(Boolean, default=True)

    producto: Mapped[Producto] = relationship(back_populates="variantes")
