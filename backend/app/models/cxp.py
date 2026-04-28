"""Compras a proveedores y Cuentas por Pagar."""
from datetime import datetime
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Compra(Base):
    """Recepcion de mercancia de proveedor. Genera entradas al kardex."""
    __tablename__ = "compras"

    id: Mapped[int] = mapped_column(primary_key=True)
    folio_interno: Mapped[str] = mapped_column(String(32), unique=True)
    proveedor_id: Mapped[int] = mapped_column(ForeignKey("proveedores.id"), index=True)

    # Datos del CFDI recibido del proveedor
    uuid_cfdi: Mapped[str | None] = mapped_column(String(40), unique=True, nullable=True)
    folio_factura_proveedor: Mapped[str | None] = mapped_column(String(40), nullable=True)
    fecha_factura: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    fecha_recepcion: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    subtotal: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    iva: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(14, 2), default=0)

    estatus: Mapped[str] = mapped_column(String(16), default="RECIBIDA")  # RECIBIDA | PAGADA | CANCELADA
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    conceptos: Mapped[list["ConceptoCompra"]] = relationship(
        back_populates="compra", cascade="all, delete-orphan"
    )


class ConceptoCompra(Base):
    __tablename__ = "conceptos_compra"

    id: Mapped[int] = mapped_column(primary_key=True)
    compra_id: Mapped[int] = mapped_column(
        ForeignKey("compras.id", ondelete="CASCADE"), index=True
    )
    variante_id: Mapped[int] = mapped_column(ForeignKey("variantes_producto.id"))
    descripcion: Mapped[str] = mapped_column(String(500))
    cantidad: Mapped[float] = mapped_column(Numeric(14, 4))
    costo_unitario: Mapped[float] = mapped_column(Numeric(14, 4))
    importe: Mapped[float] = mapped_column(Numeric(14, 2))

    compra: Mapped[Compra] = relationship(back_populates="conceptos")


class CuentaPorPagar(Base):
    __tablename__ = "cuentas_por_pagar"

    id: Mapped[int] = mapped_column(primary_key=True)
    proveedor_id: Mapped[int] = mapped_column(ForeignKey("proveedores.id"), index=True)
    compra_id: Mapped[int] = mapped_column(ForeignKey("compras.id"), unique=True)

    monto_original: Mapped[float] = mapped_column(Numeric(14, 2))
    saldo: Mapped[float] = mapped_column(Numeric(14, 2))
    fecha_vencimiento: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    pagado: Mapped[bool] = mapped_column(default=False)

    abonos: Mapped[list["AbonoCxP"]] = relationship(
        back_populates="cxp", cascade="all, delete-orphan"
    )


class AbonoCxP(Base):
    __tablename__ = "abonos_cxp"

    id: Mapped[int] = mapped_column(primary_key=True)
    cxp_id: Mapped[int] = mapped_column(
        ForeignKey("cuentas_por_pagar.id", ondelete="CASCADE"), index=True
    )
    monto: Mapped[float] = mapped_column(Numeric(14, 2))
    fecha: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    forma_pago: Mapped[str] = mapped_column(String(32))
    referencia: Mapped[str | None] = mapped_column(String(120), nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)

    cxp: Mapped[CuentaPorPagar] = relationship(back_populates="abonos")
