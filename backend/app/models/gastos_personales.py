"""Control de gastos personales mensuales (tipo Excel del usuario).

Estructura:
- GastoPersonal: filas con dia (1-31), tipo (Banorte/Amex/etc), concepto, monto
- IngresoPersonal: fuentes de ingreso (sueldo, etc) con monto

En el frontend:
  Gastos = sum(GastoPersonal.monto)
  Ingreso = sum(IngresoPersonal.monto)
  Libre = Ingreso - Gastos
"""
from datetime import datetime
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class GastoPersonal(Base):
    __tablename__ = "gastos_personales"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    dia: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tipo: Mapped[str | None] = mapped_column(String(64), nullable=True)
    concepto: Mapped[str | None] = mapped_column(String(255), nullable=True)
    monto: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    orden: Mapped[int] = mapped_column(Integer, default=0)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class IngresoPersonal(Base):
    __tablename__ = "ingresos_personales"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    fuente: Mapped[str] = mapped_column(String(120))
    monto: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    orden: Mapped[int] = mapped_column(Integer, default=0)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
