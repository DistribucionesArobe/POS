"""Corte de caja: snapshot diario de lo cobrado, desglose por forma y diferencia."""
from datetime import datetime
from sqlalchemy import String, DateTime, Numeric, ForeignKey, JSON, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CorteCaja(Base):
    __tablename__ = "cortes_caja"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)
    usuario_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True, index=True
    )

    fecha_corte: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    fecha_desde: Mapped[datetime] = mapped_column(DateTime)
    fecha_hasta: Mapped[datetime] = mapped_column(DateTime)

    n_ventas: Mapped[int] = mapped_column(Integer, default=0)
    total_vendido: Mapped[float] = mapped_column(Numeric(14, 2), default=0)

    # Desglose: {"01": {"label": "Efectivo", "monto": 1234.56, "n": 5}, ...}
    desglose_pagos: Mapped[dict] = mapped_column(JSON, default=dict)

    efectivo_esperado: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    efectivo_real: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    diferencia: Mapped[float] = mapped_column(Numeric(14, 2), default=0)

    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
