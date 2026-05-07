"""Usuarios del sistema."""
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    nombre: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    rol: Mapped[str] = mapped_column(String(32), default="cajero")

    # Empresa primaria del usuario. NULL para super_admin globales.
    empresa_id: Mapped[int | None] = mapped_column(
        ForeignKey("empresas.id"), nullable=True, index=True
    )

    # super_admin=True: puede operar cualquier empresa activa.
    super_admin: Mapped[bool] = mapped_column(Boolean, default=False)

    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
