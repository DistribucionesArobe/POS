"""Aplicar abonos a CxC y CxP."""
from sqlalchemy.orm import Session

from app.models import CuentaPorCobrar, AbonoCxC, DocumentoVenta
from app.models.venta import EstatusDocumento, MetodoPagoSAT, TipoDocumento
from app.schemas.cxc import AbonoCxCIn


def aplicar_abono_cxc(db: Session, payload: AbonoCxCIn) -> AbonoCxC:
    cxc = db.get(CuentaPorCobrar, payload.cxc_id)
    if not cxc or cxc.pagado:
        raise ValueError("CxC no existe o ya esta pagada")
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
        doc = db.get(DocumentoVenta, cxc.documento_id)
        if doc:
            doc.estatus = EstatusDocumento.PAGADO.value

    db.add(abono)
    db.commit()
    db.refresh(abono)

    # Si la factura asociada es PPD, marcar para emitir complemento de pago
    doc = db.get(DocumentoVenta, cxc.documento_id)
    if (
        payload.emitir_complemento_pago
        and doc
        and doc.tipo == TipoDocumento.FACTURA.value
        and doc.metodo_pago_sat == MetodoPagoSAT.PPD.value
    ):
        # TODO: cfdi_service.emitir_complemento_pago(db, abono.id)
        pass

    return abono
