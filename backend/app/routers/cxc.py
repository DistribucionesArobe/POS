"""Cuentas por Cobrar - filtrado por empresa."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import CuentaPorCobrar, Cliente, DocumentoVenta, Cfdi, ComplementoPago, AbonoCxC
from app.schemas.cxc import AbonoCxCIn
from app.services import pago_service, cfdi_service
from app.services.security import get_active_empresa_id

router = APIRouter()


@router.get("/cartera")
def cartera(
    dias_minimos: int = 0,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(CuentaPorCobrar, Cliente, DocumentoVenta)
        .join(Cliente, Cliente.id == CuentaPorCobrar.cliente_id)
        .join(DocumentoVenta, DocumentoVenta.id == CuentaPorCobrar.documento_id)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .filter(CuentaPorCobrar.pagado == False)
        .all()
    )
    out = []
    today = datetime.utcnow().date()
    for cxc, cli, doc in rows:
        dias = (today - cxc.fecha_emision.date()).days
        if dias < dias_minimos:
            continue
        timbrada = (
            doc.tipo == "FACTURA"
            and db.query(Cfdi).filter(Cfdi.documento_venta_id == doc.id, Cfdi.cancelado == False).first() is not None
        )
        out.append({
            "cxc_id": cxc.id, "cliente_id": cli.id, "cliente": cli.nombre,
            "whatsapp": cli.whatsapp, "documento_id": cxc.documento_id,
            "documento_folio": doc.folio, "tipo": doc.tipo,
            "metodo_pago_sat": doc.metodo_pago_sat,
            "es_ppd": doc.tipo == "FACTURA" and doc.metodo_pago_sat == "PPD" and timbrada,
            "saldo": float(cxc.saldo), "dias_antiguedad": dias,
            "fecha_emision": cxc.fecha_emision.isoformat(),
        })
    return out


@router.get("/abonos/{cxc_id}")
def listar_abonos(
    cxc_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    cxc = db.get(CuentaPorCobrar, cxc_id)
    if not cxc:
        raise HTTPException(404, "CxC no existe")
    doc = db.get(DocumentoVenta, cxc.documento_id)
    if doc.empresa_id != empresa_id:
        raise HTTPException(403, "Otra empresa")
    abonos = db.query(AbonoCxC).filter(AbonoCxC.cxc_id == cxc_id).order_by(AbonoCxC.fecha).all()
    out = []
    for a in abonos:
        cp = db.query(ComplementoPago).filter(ComplementoPago.abono_cxc_id == a.id).first()
        out.append({
            "id": a.id, "fecha": a.fecha.isoformat(),
            "monto": float(a.monto), "forma_pago": a.forma_pago,
            "referencia": a.referencia, "notas": a.notas,
            "complemento_uuid": cp.uuid_complemento if cp else None,
        })
    return out


@router.post("/complemento/{abono_id}")
def emitir_complemento(
    abono_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Emite CFDI Complemento de Pago para un abono existente.
    Requiere que la factura sea PPD y este timbrada."""
    try:
        return cfdi_service.emitir_complemento_pago(db, abono_id, empresa_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/cliente/{cliente_id}")
def saldo_cliente(
    cliente_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    total = (
        db.query(func.coalesce(func.sum(CuentaPorCobrar.saldo), 0))
        .join(DocumentoVenta, DocumentoVenta.id == CuentaPorCobrar.documento_id)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .filter(CuentaPorCobrar.cliente_id == cliente_id)
        .filter(CuentaPorCobrar.pagado == False)
        .scalar()
    )
    return {"cliente_id": cliente_id, "saldo_total": float(total or 0)}


@router.post("/abono")
def registrar_abono(
    payload: AbonoCxCIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    try:
        abono = pago_service.aplicar_abono_cxc(db, payload, empresa_id)
    except ValueError as e:
        raise HTTPException(400, str(e))

    result = {
        "id": abono.id, "monto": float(abono.monto),
        "forma_pago": abono.forma_pago, "fecha": abono.fecha.isoformat(),
    }
    # Si se solicito complemento de pago, intentarlo. Fallar el complemento no
    # revierte el abono (queda registrado y se puede emitir luego manual).
    if payload.emitir_complemento_pago:
        try:
            r = cfdi_service.emitir_complemento_pago(db, abono.id, empresa_id)
            result["complemento"] = r
        except ValueError as e:
            result["complemento_error"] = str(e)
    return result
