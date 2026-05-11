"""Pagos de una venta - permite split entre varias formas de pago.

Si una venta tiene multiples Pago rows, el forma_pago_sat del CFDI sera "99"
(Por definir, segun reglas SAT 4.0). Si solo hay uno, se usa ese codigo.
"""
from datetime import datetime
from sqlalchemy import String, DateTime, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Pago(Base):
    __tablename__ = "pagos_venta"

    id: Mapped[int] = mapped_column(primary_key=True)
    documento_venta_id: Mapped[int] = mapped_column(
        ForeignKey("documentos_venta.id", ondelete="CASCADE"), index=True
    )
    forma_pago_sat: Mapped[str] = mapped_column(String(2))  # 01, 03, 04, 28...
    monto: Mapped[float] = mapped_column(Numeric(14, 2))
    referencia: Mapped[str | None] = mapped_column(String(120), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    documento = relationship("DocumentoVenta", backref="pagos")
