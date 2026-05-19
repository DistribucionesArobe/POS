"""Monedero / programa de lealtad."""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    MonederoMovimiento, Cliente, Empresa, DocumentoVenta, Usuario,
)
from app.services.security import get_active_empresa_id, get_current_user, require_admin

router = APIRouter()


VIGENCIA_MESES = 12
MIN_CANJE = 200  # puntos minimos para canjear


def _saldo_cliente(db: Session, empresa_id: int, cliente_id: int) -> float:
    """Suma signada de todos los movimientos de un cliente en una empresa."""
    total = (
        db.query(func.coalesce(func.sum(MonederoMovimiento.puntos), 0))
        .filter(MonederoMovimiento.empresa_id == empresa_id)
        .filter(MonederoMovimiento.cliente_id == cliente_id)
        .scalar()
    )
    return float(total or 0)


@router.get("/saldo/{cliente_id}")
def saldo_cliente(
    cliente_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Saldo y resumen de movimientos del cliente."""
    cliente = db.get(Cliente, cliente_id)
    if not cliente or cliente.empresa_id != empresa_id:
        raise HTTPException(404, "Cliente no encontrado")
    return {
        "cliente_id": cliente_id,
        "cliente_nombre": cliente.nombre,
        "saldo": _saldo_cliente(db, empresa_id, cliente_id),
        "min_canje": MIN_CANJE,
    }


@router.get("/historial/{cliente_id}")
def historial_cliente(
    cliente_id: int,
    limit: int = Query(100, ge=1, le=500),
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cliente = db.get(Cliente, cliente_id)
    if not cliente or cliente.empresa_id != empresa_id:
        raise HTTPException(404, "Cliente no encontrado")
    movs = (
        db.query(MonederoMovimiento)
        .filter(MonederoMovimiento.empresa_id == empresa_id)
        .filter(MonederoMovimiento.cliente_id == cliente_id)
        .order_by(MonederoMovimiento.fecha.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": m.id, "tipo": m.tipo, "puntos": float(m.puntos),
            "documento_venta_id": m.documento_venta_id,
            "notas": m.notas,
            "fecha": m.fecha.isoformat(),
            "vence_en": m.vence_en.isoformat() if m.vence_en else None,
        }
        for m in movs
    ]


@router.get("/clientes")
def listar_clientes_con_saldo(
    solo_con_saldo: bool = True,
    empresa_id: int = Depends(get_active_empresa_id),
    _user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lista de clientes con su saldo de puntos."""
    sub = (
        db.query(
            MonederoMovimiento.cliente_id.label("cid"),
            func.sum(MonederoMovimiento.puntos).label("saldo"),
        )
        .filter(MonederoMovimiento.empresa_id == empresa_id)
        .group_by(MonederoMovimiento.cliente_id)
        .subquery()
    )
    q = (
        db.query(Cliente, sub.c.saldo)
        .outerjoin(sub, sub.c.cid == Cliente.id)
        .filter(Cliente.empresa_id == empresa_id)
        .filter(Cliente.id != 1)  # excluir Publico en General
    )
    rows = q.order_by(sub.c.saldo.desc().nullslast()).all()
    out = []
    for cli, saldo in rows:
        s = float(saldo or 0)
        if solo_con_saldo and s <= 0:
            continue
        out.append({
            "cliente_id": cli.id, "nombre": cli.nombre,
            "rfc": cli.rfc, "whatsapp": cli.whatsapp,
            "saldo": s,
        })
    return out


@router.post("/ajuste")
def ajuste_manual(
    payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    user: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin: regalar o restar puntos manualmente (cumpleaños, cortesia, correcciones)."""
    cliente_id = payload.get("cliente_id")
    puntos = payload.get("puntos")
    notas = (payload.get("notas") or "").strip()
    if not cliente_id or puntos in (None, ""):
        raise HTTPException(400, "Falta cliente_id o puntos")
    try:
        puntos = float(puntos)
    except (TypeError, ValueError):
        raise HTTPException(400, "Puntos invalido")
    cliente = db.get(Cliente, int(cliente_id))
    if not cliente or cliente.empresa_id != empresa_id:
        raise HTTPException(404, "Cliente no existe")
    mov = MonederoMovimiento(
        empresa_id=empresa_id, cliente_id=cliente.id,
        tipo="AJUSTE", puntos=puntos, notas=notas or None,
        usuario_id=user.id,
    )
    db.add(mov)
    db.commit()
    db.refresh(mov)
    return {"id": mov.id, "saldo_nuevo": _saldo_cliente(db, empresa_id, cliente.id)}


@router.post("/canje")
def aplicar_canje(
    payload: dict,
    empresa_id: int = Depends(get_active_empresa_id),
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aplica un canje. Resta puntos del saldo. Idealmente se llama desde
    el flujo de cobro de Caja antes de timbrar."""
    cliente_id = payload.get("cliente_id")
    puntos = float(payload.get("puntos") or 0)
    documento_id = payload.get("documento_venta_id")
    if not cliente_id or puntos <= 0:
        raise HTTPException(400, "Falta cliente_id o puntos > 0")
    cliente = db.get(Cliente, int(cliente_id))
    if not cliente or cliente.empresa_id != empresa_id:
        raise HTTPException(404, "Cliente no existe")
    saldo = _saldo_cliente(db, empresa_id, cliente.id)
    if puntos > saldo:
        raise HTTPException(400, f"Saldo insuficiente. Tiene {saldo:.2f} y quiere canjear {puntos:.2f}")
    if puntos < MIN_CANJE:
        raise HTTPException(400, f"Minimo de canje: {MIN_CANJE} puntos")
    mov = MonederoMovimiento(
        empresa_id=empresa_id, cliente_id=cliente.id,
        tipo="CANJE", puntos=-puntos,
        documento_venta_id=documento_id,
        usuario_id=user.id,
    )
    db.add(mov)
    db.commit()
    db.refresh(mov)
    return {"id": mov.id, "saldo_nuevo": _saldo_cliente(db, empresa_id, cliente.id)}


# ===== Helper que se llama desde venta_service =====


def acumular_puntos_por_venta(
    db: Session,
    empresa_id: int,
    cliente_id: int | None,
    documento_id: int,
    subtotal: float,
    tipo_documento: str,
) -> dict | None:
    """Acumula puntos si la empresa tiene monedero activo, el cliente esta identificado
    (no Publico en General) y el tipo de documento aplica.

    Llamado al final de crear_venta. Si algo falla, no debe romper la venta.
    Devuelve dict con los puntos generados, o None si no aplico.

    Reglas: 1 punto por cada $100 de subtotal. Vigencia 12 meses.
    """
    if not cliente_id or cliente_id == 1:
        return None
    if tipo_documento not in ("TICKET", "REMISION", "FACTURA"):
        return None
    empresa = db.get(Empresa, empresa_id)
    if not empresa or not getattr(empresa, "monedero_activo", False):
        return None
    puntos = int(subtotal // 100)
    if puntos <= 0:
        return None
    vence = datetime.utcnow() + timedelta(days=365)
    mov = MonederoMovimiento(
        empresa_id=empresa_id,
        cliente_id=cliente_id,
        tipo="GANANCIA",
        puntos=puntos,
        documento_venta_id=documento_id,
        notas=f"Ganados por {tipo_documento} de ${subtotal:.2f}",
        vence_en=vence,
    )
    db.add(mov)
    # flush, no commit - el commit lo hace el caller
    db.flush()
    return {"puntos": puntos, "vence_en": vence.isoformat()}
