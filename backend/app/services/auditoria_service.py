"""Servicio de auditoria del Tablero CxP.

Uso desde routers:
    # ANTES de modificar:
    snap_antes = snapshot_cxp(cxp)
    # ... hacer cambios ...
    db.flush()
    # DESPUES:
    registrar_cambio(db, tabla='cuentas_por_pagar', registro=cxp,
                     snapshot_antes=snap_antes, resumen='Cambio monto', user=user)

Restaurar:
    restaurar_snapshot(db, auditoria_id, user)
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import CxpAuditoria, Usuario


def _to_dict(obj: Any) -> dict:
    """Convierte un objeto SQLAlchemy a dict de sus columnas."""
    if obj is None:
        return None
    result = {}
    for c in obj.__table__.columns:
        val = getattr(obj, c.name, None)
        # Convertir tipos no serializables
        if isinstance(val, datetime):
            val = val.isoformat()
        elif hasattr(val, "__float__"):
            try:
                val = float(val)
            except Exception:
                val = str(val)
        elif isinstance(val, (list, dict)):
            pass  # JSON ya sirve
        elif val is not None and not isinstance(val, (str, int, float, bool)):
            val = str(val)
        result[c.name] = val
    return result


def snapshot(obj: Any) -> dict | None:
    """Toma snapshot del estado actual de un objeto ORM."""
    return _to_dict(obj)


def registrar_cambio(
    db: Session, *,
    tabla: str,
    registro_id: int | None,
    accion: str,  # 'insert' | 'update' | 'delete'
    snapshot_antes: dict | None = None,
    snapshot_despues: dict | None = None,
    resumen: str | None = None,
    empresa_id: int,
    user: Usuario | None = None,
) -> CxpAuditoria:
    """Registra un cambio en la auditoria."""
    audit = CxpAuditoria(
        empresa_id=empresa_id,
        tabla=tabla,
        registro_id=registro_id,
        accion=accion,
        snapshot_antes=snapshot_antes,
        snapshot_despues=snapshot_despues,
        resumen=resumen,
        usuario_id=user.id if user else None,
        usuario_email=user.email if user else None,
    )
    db.add(audit)
    return audit


# Mapeo tabla -> clase ORM (para restaurar snapshots)
def _clase_por_tabla(tabla: str):
    from app.models import (
        CuentaPorPagar, PanelCxP, DeudaBancaria, ConceptoDeudaBancaria,
        OtroPagoPanel,
    )
    return {
        "cuentas_por_pagar": CuentaPorPagar,
        "panel_cxp": PanelCxP,
        "deudas_bancarias": DeudaBancaria,
        "conceptos_deuda_bancaria": ConceptoDeudaBancaria,
        "otros_pagos_panel": OtroPagoPanel,
    }.get(tabla)


def restaurar_snapshot(
    db: Session, auditoria_id: int, empresa_id: int, user: Usuario,
) -> dict:
    """Restaura un registro al estado del snapshot_antes de una entrada de auditoria.

    Casos:
    - Si accion='insert' -> el registro no existia antes, hay que DELETE
    - Si accion='update' -> restaurar campos al snapshot_antes
    - Si accion='delete' -> re-crear el registro con snapshot_antes
    """
    audit = db.get(CxpAuditoria, auditoria_id)
    if not audit:
        raise ValueError("Registro de auditoria no existe")
    if audit.empresa_id != empresa_id:
        raise ValueError("Registro de auditoria de otra empresa")
    if audit.revertido_por:
        raise ValueError("Este cambio ya fue revertido")

    ORMClass = _clase_por_tabla(audit.tabla)
    if not ORMClass:
        raise ValueError(f"Tabla '{audit.tabla}' no soportada para restaurar")

    resumen_undo = f"Deshacer accion #{auditoria_id}"

    if audit.accion == "insert":
        # El registro no existia antes. Al deshacer lo borramos.
        if not audit.registro_id:
            raise ValueError("No hay registro_id para restaurar")
        obj = db.get(ORMClass, audit.registro_id)
        if obj:
            snap_antes_del = _to_dict(obj)
            db.delete(obj)
            db.flush()
            nueva = registrar_cambio(
                db, tabla=audit.tabla, registro_id=audit.registro_id,
                accion="delete", snapshot_antes=snap_antes_del,
                snapshot_despues=None, resumen=resumen_undo,
                empresa_id=empresa_id, user=user,
            )
            audit.revertido_por = nueva.id
        return {"ok": True, "operacion": "delete"}

    elif audit.accion == "update":
        obj = db.get(ORMClass, audit.registro_id)
        if not obj:
            raise ValueError("Registro ya no existe (fue borrado despues)")
        snap_actual = _to_dict(obj)
        # Restaurar campos del snapshot_antes (excepto id)
        antes = audit.snapshot_antes or {}
        for k, v in antes.items():
            if k == "id":
                continue
            if hasattr(obj, k):
                # Manejo simple: intentar setear. datetime queda como str, hay que parsear
                if v and isinstance(v, str) and k.startswith(("fecha", "creado")):
                    try:
                        v = datetime.fromisoformat(v)
                    except Exception:
                        pass
                setattr(obj, k, v)
        db.flush()
        nueva = registrar_cambio(
            db, tabla=audit.tabla, registro_id=obj.id,
            accion="update", snapshot_antes=snap_actual,
            snapshot_despues=_to_dict(obj), resumen=resumen_undo,
            empresa_id=empresa_id, user=user,
        )
        audit.revertido_por = nueva.id
        return {"ok": True, "operacion": "update"}

    elif audit.accion == "delete":
        # El registro fue borrado. Re-crearlo con snapshot_antes.
        antes = audit.snapshot_antes or {}
        if not antes:
            raise ValueError("Sin snapshot para restaurar")
        campos = {}
        for k, v in antes.items():
            if k == "id":
                continue
            if v and isinstance(v, str) and k.startswith(("fecha", "creado")):
                try:
                    v = datetime.fromisoformat(v)
                except Exception:
                    pass
            campos[k] = v
        try:
            nuevo = ORMClass(**campos)
            db.add(nuevo)
            db.flush()
        except Exception as e:
            raise ValueError(f"No se pudo recrear el registro: {e}")
        nueva = registrar_cambio(
            db, tabla=audit.tabla, registro_id=nuevo.id,
            accion="insert", snapshot_antes=None,
            snapshot_despues=_to_dict(nuevo), resumen=resumen_undo,
            empresa_id=empresa_id, user=user,
        )
        audit.revertido_por = nueva.id
        return {"ok": True, "operacion": "insert", "id": nuevo.id}

    raise ValueError(f"Accion '{audit.accion}' desconocida")
