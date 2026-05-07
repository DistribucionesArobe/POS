"""Cotizaciones generadas por CotizaExpress (clawdbot-server)."""
from datetime import datetime
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Cotizacion(Base):
    __tablename__ = "cotizaciones"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)

    folio: Mapped[str] = mapped_column(String(32), unique=True, index=True)

    cliente_id: Mapped[int | None] = mapped_column(
        ForeignKey("clientes.id"), nullable=True, index=True
    )
    whatsapp_origen: Mapped[str | None] = mapped_column(String(32), nullable=True)
    nombre_libre: Mapped[str | None] = mapped_column(String(255), nullable=True)

    fecha: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    vigencia_hasta: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    conceptos: Mapped[list] = mapped_column(JSON, default=list)

    subtotal: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    iva: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(14, 2), default=0)

    estatus: Mapped[str] = mapped_column(String(16), default="ENVIADA")

    documento_venta_id: Mapped[int | None] = mapped_column(
        ForeignKey("documentos_venta.id"), nullable=True
    )

    pdf_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
