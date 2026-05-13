"""Activos de la empresa (vehiculos, tarjetas de gasolina, cuentas de servicios).

Modelo generico para los listados internos del admin que antes vivian en Excel:
- vehiculo  : col1=Vehiculo, col2=Placa,    col3=Serie
- gasolina  : col1=Nombre,   col2=Tarjeta
- comapa    : col1=Concepto, col2=Numero

Se mantiene generico para que el usuario pueda anadir categorias nuevas sin
tener que tocar el esquema.
"""
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Activo(Base):
    __tablename__ = "activos"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    categoria: Mapped[str] = mapped_column(String(32), index=True)

    col1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    col2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    col3: Mapped[str | None] = mapped_column(String(255), nullable=True)

    orden: Mapped[int] = mapped_column(Integer, default=0)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
