"""Endpoints CFDI 4.0 - se apoyan en services/cfdi_service y integrations/facturama."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import cfdi_service

router = APIRouter()


@router.post("/timbrar/{documento_id}")
def timbrar_documento(documento_id: int, db: Session = Depends(get_db)):
    """Timbra una factura ya creada en documentos_venta."""
    return cfdi_service.timbrar(db, documento_id)


@router.post("/cancelar/{cfdi_id}")
def cancelar_cfdi(
    cfdi_id: int,
    motivo: str,                    # 01 | 02 | 03 | 04
    uuid_sustituye: str | None = None,
    db: Session = Depends(get_db),
):
    """Cancela CFDI con motivo SAT."""
    return cfdi_service.cancelar(db, cfdi_id, motivo, uuid_sustituye)


@router.post("/nota-credito")
def emitir_nota_credito(
    factura_id: int,
    motivo: str,
    conceptos: list[dict],          # [{variante_id, cantidad, importe}]
    db: Session = Depends(get_db),
):
    return cfdi_service.emitir_nota_credito(db, factura_id, motivo, conceptos)


@router.post("/complemento-pago/{abono_cxc_id}")
def emitir_complemento_pago(abono_cxc_id: int, db: Session = Depends(get_db)):
    """Emite complemento P por un cobro a factura PPD."""
    return cfdi_service.emitir_complemento_pago(db, abono_cxc_id)
