"""Cuentas por Pagar y compras."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import CuentaPorPagar, Compra

router = APIRouter()


@router.get("/cartera")
def cartera_proveedores(db: Session = Depends(get_db)):
    rows = db.query(CuentaPorPagar).filter(CuentaPorPagar.pagado == False).all()
    return [
        {
            "cxp_id": c.id, "proveedor_id": c.proveedor_id,
            "saldo": float(c.saldo),
            "fecha_vencimiento": c.fecha_vencimiento.isoformat() if c.fecha_vencimiento else None,
        }
        for c in rows
    ]


@router.get("/compras")
def listar_compras(db: Session = Depends(get_db)):
    rows = db.query(Compra).order_by(Compra.fecha_recepcion.desc()).limit(100).all()
    return [
        {
            "id": c.id, "folio": c.folio_interno, "proveedor_id": c.proveedor_id,
            "uuid_cfdi": c.uuid_cfdi, "total": float(c.total), "estatus": c.estatus,
        }
        for c in rows
    ]


# TODO: POST /compras (recepcion mercancia con descarga XML proveedor),
#       POST /abono-cxp, etc.
