"""Auditoria de cambios en el Tablero CxP.

Cada UPDATE, INSERT o DELETE en tablas relacionadas al Tablero CxP
(cuentas_por_pagar, panel_cxp, deudas_bancarias, conceptos_deuda_bancaria,
otros_pagos_panel) genera un registro aqui con el snapshot antes/despues.

Permite:
- Ver historial completo (quien, cuando, que cambio)
- Deshacer una accion especifica (restaurar el snapshot 'antes')
"""
from datetime import datetime
from sqlalchemy import String, DateTime, Integer, JSON, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CxpAuditoria(Base):
    __tablename__ = "cxp_auditoria"
    __table_args__ = (
        Index("ix_cxp_audit_empresa_fecha", "empresa_id", "fecha"),
        Index("ix_cxp_audit_tabla_registro", "tabla", "registro_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"), index=True)

    # Tabla afectada: 'cuentas_por_pagar' | 'panel_cxp' | 'deudas_bancarias' |
    # 'conceptos_deuda_bancaria' | 'otros_pagos_panel'
    tabla: Mapped[str] = mapped_column(String(64), index=True)

    # ID del registro dentro de esa tabla (null si es INSERT nuevo antes de tener ID)
    registro_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    # 'insert' | 'update' | 'delete'
    accion: Mapped[str] = mapped_column(String(16))

    # Snapshot completo del registro ANTES del cambio (null si es INSERT nuevo)
    snapshot_antes: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Snapshot completo del registro DESPUES del cambio (null si es DELETE)
    snapshot_despues: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Descripcion legible: 'Cambio monto de 5000 a 6000', etc.
    resumen: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Quien hizo el cambio
    usuario_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True, index=True
    )
    usuario_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    fecha: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )

    # Si ya fue restaurado por otro registro, apunta a ese ID
    revertido_por: Mapped[int | None] = mapped_column(Integer, nullable=True)
