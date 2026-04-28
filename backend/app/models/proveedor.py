"""Proveedores para compras y CxP."""
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Proveedor(Base):
    __tablename__ = "proveedores"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(255), index=True)
    rfc: Mapped[str | None] = mapped_column(String(13), nullable=True)
    razon_social: Mapped[str | None] = mapped_column(String(255), nullable=True)
    correo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(32), nullable=True)
    direccion: Mapped[str | None] = mapped_column(Text, nullable=True)
    dias_credito: Mapped[int] = mapped_column(default=0)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
