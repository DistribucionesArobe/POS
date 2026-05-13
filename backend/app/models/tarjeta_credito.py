"""Control de gastos en tarjetas de credito ligadas al negocio.

Estilo Excel del usuario:
- AMEX Negocios     (cargos del negocio en Amex)
- AMEX Reembolsos   (cargos personales que se reembolsan)
- Banorte Padel     (gastos relacionados al padel)
- Banorte Aceromax  (gastos relacionados a Aceromax)

Un solo modelo flat con campo seccion para distinguir.
"""
from datetime import datetime
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Integer
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
