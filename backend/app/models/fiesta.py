"""Fiestas / eventos de cumpleaños en el Club de Padel."""
from datetime import datetime, date
from sqlalchemy import (
    Column, Integer, String, Numeric, DateTime, Date, Boolean, ForeignKey, Text,
)
from app.db import Base


class Fiesta(Base):
    __tablename__ = "fiestas"

    id = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    fecha = Column(Date, nullable=False, index=True)
    nombre = Column(String(200), nullable=False)  # Nombre del cumpleañero o del evento
    telefono = Column(String(30))
    # Deportes incluidos (al menos uno true)
    incluye_padel = Column(Boolean, nullable=False, default=False)
    incluye_futbol = Column(Boolean, nullable=False, default=False)
    incluye_comida = Column(Boolean, nullable=False, default=False)
    monto = Column(Numeric(10, 2), nullable=False, default=0)
    anticipo = Column(Numeric(10, 2), nullable=False, default=0)
    # Estados: PENDIENTE | CONFIRMADA | REALIZADA | CANCELADA
    estatus = Column(String(20), nullable=False, default="PENDIENTE")
    notas = Column(Text)
    creado_por = Column(Integer, ForeignKey("usuarios.id"))
    creado_en = Column(DateTime, default=datetime.utcnow, nullable=False)
