"""Cotizaciones generadas por CotizaExpress (clawdbot-server).

Tabla compartida: CotizaExpress escribe aqui via la misma DB. Cuando el cliente
confirma la cotizacion en mostrador, se promueve a una REMISION o TICKET en
documentos_venta. Mientras tanto NO descuenta inventario.
"""
from datetime import datetime
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Cotizacion(Base):
    __tablename__ = "cotizaciones"

    id: Mapped[int] = mapped_column(primary_key=True)
    folio: Mapped[str] = mapped_column(String(32), unique=True, index=True)

    cliente_id: Mapped[int | None] = mapped_column(
        ForeignKey("clientes.id"), nullable=True, index=True
    )
    # Si llego por WhatsApp y aun no identificamos al cliente
    whatsapp_origen: Mapped[str | None] = mapped_column(String(32), nullable=True)
    nombre_libre: Mapped[str | None] = mapped_column(String(255), nullable=True)

    fecha: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    vigencia_hasta: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Conceptos como JSON - evita acoplamiento con conceptos_venta
    # Forma: [{"variante_id": 1, "sku": "...", "cantidad": 2, "precio": 100, "importe": 200}, ...]
    conceptos: Mapped[list] = mapped_column(JSON, default=list)

    subtotal: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    iva: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(14, 2), default=0)

    estatus: Mapped[str] = mapped_column(String(16), default="ENVIADA")
    # ENVIADA | ACEPTADA | CONVERTIDA | EXPIRADA | RECHAZADA

    documento_venta_id: Mapped[int | None] = mapped_column(
        ForeignKey("documentos_venta.id"), nullable=True
    )

    pdf_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
