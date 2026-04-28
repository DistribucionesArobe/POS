"""Clientes - puede ser publico general o con datos fiscales para CFDI."""
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Cliente(Base):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(255), index=True)

    # Datos fiscales (CFDI 4.0)
    rfc: Mapped[str | None] = mapped_column(String(13), index=True, nullable=True)
    razon_social: Mapped[str | None] = mapped_column(String(255), nullable=True)
    regimen_fiscal: Mapped[str | None] = mapped_column(String(8), nullable=True)
    codigo_postal: Mapped[str | None] = mapped_column(String(5), nullable=True)
    uso_cfdi_default: Mapped[str | None] = mapped_column(String(8), nullable=True)
    correo: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Contacto
    telefono: Mapped[str | None] = mapped_column(String(32), nullable=True)
    whatsapp: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    direccion: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Credito - sin limite establecido por decision de Aceromax;
    # el campo queda como informativo (None = ilimitado)
    limite_credito: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    dias_credito: Mapped[int] = mapped_column(default=0)

    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
