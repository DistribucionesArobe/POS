"""Monedero / programa de lealtad: 1 punto por cada $100 de compra.

Diseño:
- Cada compra de un cliente identificado en una empresa con monedero activo genera
  un movimiento tipo GANANCIA con puntos = floor(subtotal / 100).
- Los puntos vencen a 12 meses desde su generacion.
- El saldo se calcula sumando GANANCIA - CANJE +/- AJUSTE - EXPIRACION.
- Aplica solo a TICKET / REMISION / FACTURA con cliente_id != Publico-en-General (id=1).
- La empresa debe tener monedero_activo=True (default: solo Aceromax).
"""
from datetime import datetime
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class MonederoMovimiento(Base):
    __tablename__ = "monedero_movimientos"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"), index=True)

    # GANANCIA | CANJE | AJUSTE | EXPIRACION
    tipo: Mapped[str] = mapped_column(String(20), index=True)
    # Signo: +ganancia/+ajuste positivo, -canje/-expiracion/-ajuste negativo
    puntos: Mapped[float] = mapped_column(Numeric(14, 2), default=0)

    documento_venta_id: Mapped[int | None] = mapped_column(
        ForeignKey("documentos_venta.id"), nullable=True, index=True,
    )
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    fecha: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    # Solo aplica a GANANCIA - cuando expiran si no se canjearon
    vence_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    usuario_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True,
    )
