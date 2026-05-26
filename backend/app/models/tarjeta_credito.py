"""Control de gastos en tarjetas de credito ligadas al negocio.

Estilo Excel del usuario:
- AMEX Negocios     (cargos del negocio en Amex)
- AMEX Reembolsos   (cargos personales que se reembolsan)
- Banorte Padel     (gastos relacionados al padel)
- Banorte Aceromax  (gastos relacionados a Aceromax)

Un solo modelo flat con campo seccion para distinguir.
"""
from datetime import datetime
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ConceptoTarjeta(Base):
    __tablename__ = "tarjeta_conceptos"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    seccion: Mapped[str] = mapped_column(String(32), index=True)
    concepto: Mapped[str] = mapped_column(String(255))
    monto: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    orden: Mapped[int] = mapped_column(Integer, default=0)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # Soft delete: si tiene fecha, no aparece en la lista normal pero se puede restaurar.
    eliminado_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    # Marcado como "ya lo separe del banco" aunque no hayas pagado la TC.
    # Se suma aparte en el header como PAGADO.
    pagado: Mapped[bool] = mapped_column(Boolean, default=False, index=True)


class TarjetaTotal(Base):
    """Legacy. Mantenido por compatibilidad; el modelo activo es TarjetaSubcuenta."""
    __tablename__ = "tarjeta_totales"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    tarjeta: Mapped[str] = mapped_column(String(32), index=True)
    total_deuda: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    actualizado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TarjetaSubcuenta(Base):
    """Sub-cuentas dentro de una tarjeta. La TOTAL DEUDA mostrada en el header
    se calcula como la suma de los montos de todas las subcuentas de esa tarjeta.

    Ejemplos:
    - Banorte: Infinite 4682 ($170,673) + Platinum 1269 ($10,337)
    - AMEX:    AMEX ($109,000) o multiples si tiene varias tarjetas
    """
    __tablename__ = "tarjeta_subcuentas"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    tarjeta: Mapped[str] = mapped_column(String(32), index=True)  # amex | banorte
    nombre: Mapped[str] = mapped_column(String(120))
    monto: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    orden: Mapped[int] = mapped_column(default=0)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
