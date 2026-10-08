"""Conteo fisico de inventario con captura y ajuste automatico."""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Numeric, DateTime, ForeignKey, Boolean, Text,
)
from sqlalchemy.orm import relationship

from app.db import Base


class ConteoInventario(Base):
    __tablename__ = "conteos_inventario"

    id = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    fecha = Column(DateTime, default=datetime.utcnow, nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"))
    categoria_filtro = Column(String(100))
    busqueda_filtro = Column(String(200))
    total_items_contados = Column(Integer, nullable=False, default=0)
    total_items_con_diferencia = Column(Integer, nullable=False, default=0)
    valor_ajuste_total = Column(Numeric(14, 2), nullable=False, default=0)
    notas = Column(Text)
    aplicado = Column(Boolean, nullable=False, default=False)

    items = relationship("ConteoInventarioItem", back_populates="conteo",
                         cascade="all, delete-orphan")


class ConteoInventarioItem(Base):
    __tablename__ = "conteo_inventario_items"

    id = Column(Integer, primary_key=True)
    conteo_id = Column(Integer, ForeignKey("conteos_inventario.id", ondelete="CASCADE"),
                       nullable=False, index=True)
    variante_id = Column(Integer, ForeignKey("variantes_producto.id"), nullable=False)
    stock_sistema = Column(Numeric(14, 3), nullable=False)
    stock_contado = Column(Numeric(14, 3), nullable=False)
    diferencia = Column(Numeric(14, 3), nullable=False)
    costo_unit = Column(Numeric(14, 4), nullable=False, default=0)
    valor_diferencia = Column(Numeric(14, 2), nullable=False, default=0)
    notas = Column(String(300))

    conteo = relationship("ConteoInventario", back_populates="items")
