"""Compras a proveedores y Cuentas por Pagar."""
from datetime import datetime
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Compra(Base):
    """Recepcion de mercancia de proveedor. Genera entradas al kardex."""
    __tablename__ = "compras"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)

    folio_interno: Mapped[str] = mapped_column(String(32), unique=True)
    proveedor_id: Mapped[int] = mapped_column(ForeignKey("proveedores.id"), index=True)

    uuid_cfdi: Mapped[str | None] = mapped_column(String(40), unique=True, nullable=True)
    folio_factura_proveedor: Mapped[str | None] = mapped_column(String(40), nullable=True)
    fecha_factura: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    fecha_recepcion: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    subtotal: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    iva: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(14, 2), default=0)

    estatus: Mapped[str] = mapped_column(String(16), default="RECIBIDA")
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
    empresa_id: Mapped[int | None] = mapped_column(
        ForeignKey("empresas.id"), nullable=True, index=True
    )
    proveedor_id: Mapped[int] = mapped_column(ForeignKey("proveedores.id"), index=True)
    # Si proviene de una Compra registrada, se liga. Pero permitimos CxP manuales
    # sin compra para el flujo tipo Excel (solo control de deudas).
    compra_id: Mapped[int | None] = mapped_column(
        ForeignKey("compras.id"), unique=True, nullable=True
    )

    folio_factura: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    fecha_recepcion: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    observaciones: Mapped[str | None] = mapped_column(Text, nullable=True)

    monto_original: Mapped[float] = mapped_column(Numeric(14, 2))
    saldo: Mapped[float] = mapped_column(Numeric(14, 2))
    fecha_vencimiento: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    pagado: Mapped[bool] = mapped_column(default=False)

    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    abonos: Mapped[list["AbonoCxP"]] = relationship(
        back_populates="cxp", cascade="all, delete-orphan"
    )


class PanelCxP(Base):
    """Snapshot mensual editable del 'tablero' tipo Excel del usuario.
    Un registro por (empresa, año, mes). Los campos son todos manual."""
    __tablename__ = "panel_cxp"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    anio: Mapped[int] = mapped_column()
    mes: Mapped[int] = mapped_column()  # 1-12

    # Editables tipo Excel
    venta_objetivo_mes: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    saldo_banco: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    usd_mxn: Mapped[float] = mapped_column(Numeric(8, 4), default=0)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    actualizado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


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
