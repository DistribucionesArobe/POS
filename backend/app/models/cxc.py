"""Cuentas por Cobrar.

Cada documento de venta a credito (REMISION o FACTURA-PPD) genera una
CuentaPorCobrar con saldo pendiente. Los abonos se aplican aqui y, cuando
el saldo llega a cero, el documento queda PAGADO.
"""
from datetime import datetime
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class CuentaPorCobrar(Base):
    __tablename__ = "cuentas_por_cobrar"

    id: Mapped[int] = mapped_column(primary_key=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), index=True)
    documento_id: Mapped[int] = mapped_column(
        ForeignKey("documentos_venta.id"), unique=True
    )

    monto_original: Mapped[float] = mapped_column(Numeric(14, 2))
    saldo: Mapped[float] = mapped_column(Numeric(14, 2))
    fecha_emision: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    fecha_vencimiento: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    pagado: Mapped[bool] = mapped_column(default=False)

    abonos: Mapped[list["AbonoCxC"]] = relationship(
        back_populates="cxc",
        cascade="all, delete-orphan",
    )


class AbonoCxC(Base):
    __tablename__ = "abonos_cxc"

    id: Mapped[int] = mapped_column(primary_key=True)
    cxc_id: Mapped[int] = mapped_column(
        ForeignKey("cuentas_por_cobrar.id", ondelete="CASCADE"), index=True
    )
    monto: Mapped[float] = mapped_column(Numeric(14, 2))
    fecha: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    forma_pago: Mapped[str] = mapped_column(String(32))  # EFECTIVO, TRANSFERENCIA, etc.
    referencia: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Si vino de un comprobante WhatsApp procesado por Claude
    origen: Mapped[str] = mapped_column(String(32), default="MANUAL")  # MANUAL | WHATSAPP_FOTO
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)

    cxc: Mapped[CuentaPorCobrar] = relationship(back_populates="abonos")
