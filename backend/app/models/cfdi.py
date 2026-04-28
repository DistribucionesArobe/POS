"""CFDI 4.0 emitidos via Facturama y complementos de pago.

Un Cfdi siempre se relaciona con un DocumentoVenta (FACTURA o NOTA_CREDITO).
ComplementoPago se emite por cada cobro a una factura PPD.
"""
from datetime import datetime
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Cfdi(Base):
    __tablename__ = "cfdis"

    id: Mapped[int] = mapped_column(primary_key=True)
    documento_venta_id: Mapped[int] = mapped_column(
        ForeignKey("documentos_venta.id"), unique=True
    )

    # Datos del timbre fiscal
    uuid: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    serie: Mapped[str] = mapped_column(String(10))
    folio: Mapped[str] = mapped_column(String(20))
    fecha_timbrado: Mapped[datetime] = mapped_column(DateTime)
    rfc_emisor: Mapped[str] = mapped_column(String(13))
    rfc_receptor: Mapped[str] = mapped_column(String(13))
    total: Mapped[float] = mapped_column(Numeric(14, 2))
    tipo_comprobante: Mapped[str] = mapped_column(String(1))  # I = Ingreso, E = Egreso, P = Pago

    # XML y PDF guardados (path o url - aqui guardamos contenido base64 / S3)
    xml_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    pdf_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Cancelacion
    cancelado: Mapped[bool] = mapped_column(default=False)
    motivo_cancelacion: Mapped[str | None] = mapped_column(String(2), nullable=True)
    uuid_sustituye: Mapped[str | None] = mapped_column(String(40), nullable=True)
    fecha_cancelacion: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Respuesta cruda de Facturama (debug / auditoria)
    respuesta_pac: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    complementos: Mapped[list["ComplementoPago"]] = relationship(
        back_populates="cfdi_origen", cascade="all, delete-orphan",
        foreign_keys="ComplementoPago.cfdi_origen_id",
    )


class ComplementoPago(Base):
    """CFDI tipo P emitido cuando se cobra una factura PPD."""
    __tablename__ = "complementos_pago"

    id: Mapped[int] = mapped_column(primary_key=True)
    cfdi_origen_id: Mapped[int] = mapped_column(ForeignKey("cfdis.id"), index=True)
    abono_cxc_id: Mapped[int | None] = mapped_column(
        ForeignKey("abonos_cxc.id"), nullable=True
    )

    uuid_complemento: Mapped[str] = mapped_column(String(40), unique=True)
    monto_pagado: Mapped[float] = mapped_column(Numeric(14, 2))
    fecha_pago: Mapped[datetime] = mapped_column(DateTime)
    forma_pago_sat: Mapped[str] = mapped_column(String(2))
    moneda: Mapped[str] = mapped_column(String(3), default="MXN")
    xml_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    cfdi_origen: Mapped[Cfdi] = relationship(
        back_populates="complementos", foreign_keys=[cfdi_origen_id]
    )
