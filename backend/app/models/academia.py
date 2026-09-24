"""Academia deportiva - registro de pagos de alumnos (padel, futbol, etc)."""
from datetime import datetime, date
from sqlalchemy import (
    Column, Integer, String, Numeric, DateTime, Date, ForeignKey, Text,
)

from app.db import Base


class AcademiaPago(Base):
    """Cada pago (mensualidad o clase suelta) de un alumno de la academia."""
    __tablename__ = "academia_pagos"

    id = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    fecha_pago = Column(Date, nullable=False, default=date.today)
    alumno_nombre = Column(String(200), nullable=False, index=True)
    padres_nombre = Column(String(200))
    telefono = Column(String(30))
    monto_pagado = Column(Numeric(10, 2), nullable=False, default=0)
    # Se calcula automatico = fecha_pago + 1 mes al crear
    fecha_proximo_pago = Column(Date, index=True)
    deporte = Column(String(30), nullable=False, default="futbol")
    notas = Column(Text)
    creado_por = Column(Integer, ForeignKey("usuarios.id"))
    creado_en = Column(DateTime, default=datetime.utcnow, nullable=False)
