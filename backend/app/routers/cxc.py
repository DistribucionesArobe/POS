"""Cuentas por Cobrar."""
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import CuentaPorCobrar, AbonoCxC, Cliente
from app.schemas.cxc import AbonoCxCIn
from app.services import pago_service

router = APIRouter()


@router.get("/cartera")
def cartera(dias_minimos: int = 0, db: Session = Depends(get_db)):
    """Cartera total con antigüedad. Usado por el cobrador automatico."""
    rows = (
        db.query(CuentaPorCobrar, Cliente)
        .join(Cliente, Cliente.id == CuentaPorCobrar.cliente_id)
        .filter(CuentaPorCobrar.pagado == False)
        .all()
    )
    out = []
    today = datetime.utcnow().date()
    for cxc, cli in rows:
        dias = (today - cxc.fecha_emision.date()).days
        if dias < dias_minimos:
            continue
        out.append({
            "cxc_id": cxc.id, "cliente_id": cli.id, "cliente": cli.nombre,
            "whatsapp": cli.whatsapp, "documento_id": cxc.documento_id,
            "saldo": float(cxc.saldo), "dias_antiguedad": dias,
            "fecha_emision": cxc.fecha_emision.isoformat(),
        })
    return out


@router.get("/cliente/{cliente_id}")
def saldo_cliente(cliente_id: int, db: Session = Depends(get_db)):
    total = db.query(func.coalesce(func.sum(CuentaPorCobrar.saldo), 0)).filter(
        CuentaPorCobrar.cliente_id == cliente_id,
        CuentaPorCobrar.pagado == False,
    ).scalar()
    return {"cliente_id": cliente_id, "saldo_total": float(total)}


@router.post("/abono")
def registrar_abono(payload: AbonoCxCIn, db: Session = Depends(get_db)):
    return pago_service.aplicar_abono_cxc(db, payload)
