"""Empresa - entidad fiscal independiente que opera con su propio RFC."""
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Empresa(Base):
    __tablename__ = "empresas"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120))
    rfc: Mapped[str] = mapped_column(String(13), unique=True, index=True)
    razon_social: Mapped[str] = mapped_column(String(255))
    regimen_fiscal: Mapped[str] = mapped_column(String(8))
    codigo_postal: Mapped[str] = mapped_column(String(5))

    # Credenciales Facturama por empresa
    facturama_user: Mapped[str | None] = mapped_column(String(120), nullable=True)
    facturama_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    facturama_api_url: Mapped[str] = mapped_column(
        String(120), default="https://apisandbox.facturama.com.mx"
    )

    activa: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
