"""Documentos de venta polimorficos.

Un solo modelo para los 4 tipos:
  - TICKET: venta de mostrador, sin datos fiscales, NO genera CxC
  - REMISION: venta a credito sin facturar, descuenta inventario, SI genera CxC
              (cliente puede pedir factura despues - se consolidan en factura global)
  - FACTURA: CFDI emitido, descuenta inventario, genera CxC si es PPD
  - NOTA_CREDITO: CFDI tipo Egreso, devuelve mercancia y/o ajusta saldo

Todos comparten estructura comun. CFDI vive en su propia tabla relacionada.
"""
from datetime import datetime
from enum import Enum
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Text, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class TipoDocumento(str, Enum):
    TICKET = "TICKET"
    REMISION = "REMISION"
    FACTURA = "FACTURA"
    NOTA_CREDITO = "NOTA_CREDITO"


class EstatusDocumento(str, Enum):
    BORRADOR = "BORRADOR"          # cotizacion preliminar (de CotizaExpress)
    CONFIRMADO = "CONFIRMADO"       # ya descontó inventario
    FACTURADO = "FACTURADO"         # remision que ya se consolidó en una factura
    CANCELADO = "CANCELADO"
    PAGADO = "PAGADO"


class FormaPagoSAT(str, Enum):
    EFECTIVO = "01"
    CHEQUE = "02"
    TRANSFERENCIA = "03"
    TARJETA_CREDITO = "04"
    TARJETA_DEBITO = "28"
    POR_DEFINIR = "99"  # PPD


class MetodoPagoSAT(str, Enum):
    PUE = "PUE"  # Pago en una sola exhibicion
    PPD = "PPD"  # Pago en parcialidades o diferido


class DocumentoVenta(Base):
    __tablename__ = "documentos_venta"
    __table_args__ = (
        Index("ix_docventa_cliente_estatus", "cliente_id", "estatus"),
        Index("ix_docventa_tipo_fecha", "tipo", "fecha"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    folio: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    tipo: Mapped[str] = mapped_column(String(16))  # TipoDocumento
    estatus: Mapped[str] = mapped_column(String(16), default=EstatusDocumento.BORRADOR.value)

    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), index=True)
    vendedor_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)

    fecha: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    fecha_vencimiento: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Totales
    subtotal: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    descuento: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    iva: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(14, 2), default=0)

    # Pago / CFDI
    forma_pago_sat: Mapped[str] = mapped_column(String(2), default=FormaPagoSAT.EFECTIVO.value)
    metodo_pago_sat: Mapped[str] = mapped_column(String(3), default=MetodoPagoSAT.PUE.value)
    moneda: Mapped[str] = mapped_column(String(3), default="MXN")
    uso_cfdi: Mapped[str | None] = mapped_column(String(8), nullable=True)

    # Si esta REMISION fue consolidada en una FACTURA, aqui apunta
    factura_padre_id: Mapped[int | None] = mapped_column(
        ForeignKey("documentos_venta.id"), nullable=True, index=True
    )

    # Si es NOTA_CREDITO, apunta a la factura que afecta
    factura_relacionada_id: Mapped[int | None] = mapped_column(
        ForeignKey("documentos_venta.id"), nullable=True
    )

    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    conceptos: Mapped[list["ConceptoVenta"]] = relationship(
        back_populates="documento",
        cascade="all, delete-orphan",
    )


class ConceptoVenta(Base):
    """Linea de un documento de venta."""
    __tablename__ = "conceptos_venta"

    id: Mapped[int] = mapped_column(primary_key=True)
    documento_id: Mapped[int] = mapped_column(
        ForeignKey("documentos_venta.id", ondelete="CASCADE"), index=True
    )
    variante_id: Mapped[int] = mapped_column(ForeignKey("variantes_producto.id"))

    descripcion: Mapped[str] = mapped_column(String(500))
    cantidad: Mapped[float] = mapped_column(Numeric(14, 4))
    precio_unitario: Mapped[float] = mapped_column(Numeric(14, 4))
    descuento: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    importe: Mapped[float] = mapped_column(Numeric(14, 2))

    # Snapshot SAT al momento de la venta
    clave_prod_serv_sat: Mapped[str | None] = mapped_column(String(8), nullable=True)
    clave_unidad_sat: Mapped[str | None] = mapped_column(String(3), nullable=True)
    tasa_iva: Mapped[float] = mapped_column(Numeric(6, 4), default=0.16)

    documento: Mapped[DocumentoVenta] = relationship(back_populates="conceptos")
