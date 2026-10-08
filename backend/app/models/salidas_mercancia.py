"""Salidas de mercancia parciales contra factura madre (apartados).

Flujo:
- Factura se timbra con flag `tiene_entregas_pendientes = true` → NO descuenta inventario
- Cliente va retirando poco a poco
- Cada salida descuenta inventario del producto real entregado
- Puede ser el mismo producto facturado o uno distinto equivalente en valor
- Cuando valor_entregado >= total de factura → se completa
"""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Numeric, DateTime, ForeignKey, Text,
)
from sqlalchemy.orm import relationship

from app.db import Base


class SalidaMercancia(Base):
    __tablename__ = "salidas_mercancia"

    id = Column(Integer, primary_key=True)
    documento_venta_id = Column(Integer, ForeignKey("documentos_venta.id"), nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    fecha = Column(DateTime, default=datetime.utcnow, nullable=False)
    valor_total = Column(Numeric(14, 2), nullable=False, default=0)
    notas = Column(Text)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"))
    creado_en = Column(DateTime, default=datetime.utcnow, nullable=False)

    items = relationship(
        "SalidaMercanciaItem", back_populates="salida",
        cascade="all, delete-orphan",
    )


class SalidaMercanciaItem(Base):
    __tablename__ = "salidas_mercancia_items"

    id = Column(Integer, primary_key=True)
    salida_id = Column(Integer, ForeignKey("salidas_mercancia.id", ondelete="CASCADE"), nullable=False, index=True)
    variante_id = Column(Integer, ForeignKey("variantes_producto.id"), nullable=False, index=True)
    descripcion = Column(String(300))
    cantidad = Column(Numeric(14, 3), nullable=False)
    precio_unitario = Column(Numeric(14, 4), nullable=False)
    importe = Column(Numeric(14, 2), nullable=False)
    notas = Column(String(300))

    salida = relationship("SalidaMercancia", back_populates="items")
