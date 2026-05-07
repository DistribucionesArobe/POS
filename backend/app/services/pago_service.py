"""Aplicar abonos a CxC y CxP, validando empresa."""
from sqlalchemy.orm import Session

from app.models import CuentaPorCobrar, AbonoCxC, DocumentoVenta
from app.models.venta import EstatusDocumento, MetodoPagoSAT, TipoDocumento
from app.schemas.cxc import AbonoCxCIn


def aplicar_abono_cxc(db: Session, payload: AbonoCxCIn, empresa_id: int) -> AbonoCxC:
    cxc = db.get(CuentaPorCobrar, payload.cxc_id)
    if not cxc or cxc.pagado:
        raise ValueError("CxC no existe o ya esta pagada")
    doc = db.get(DocumentoVenta, cxc.documento_id)
    if not doc or doc.empresa_id != empresa_id:
        raise ValueError("CxC pertenece a otra empresa")
    if payload.monto > float(cxc.saldo) + 0.01:
        raise ValueError(f"Monto excede saldo ({cxc.saldo})")

    abono = AbonoCxC(
        cxc_id=cxc.id,
        monto=payload.monto,
        forma_pago=payload.forma_pago,
        referencia=payload.referencia,
        origen=payload.origen,
        notas=payload.notas,
    )
    cxc.saldo = float(cxc.saldo) - payload.monto
    if cxc.saldo <= 0.01:
        cxc.pagado = True
        doc.estatus = EstatusDocumento.PAGADO.value

    db.add(abono)
    db.commit()
    db.refresh(abono)
    return abono
