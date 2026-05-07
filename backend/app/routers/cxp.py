"""Cuentas por Pagar y compras - filtrado por empresa."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import CuentaPorPagar, Compra
from app.services.security import get_active_empresa_id

router = APIRouter()


@router.get("/cartera")
def cartera_proveedores(
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(CuentaPorPagar)
        .join(Compra, Compra.id == CuentaPorPagar.compra_id)
        .filter(Compra.empresa_id == empresa_id)
        .filter(CuentaPorPagar.pagado == False)
        .all()
    )
    return [
        {
            "cxp_id": c.id, "proveedor_id": c.proveedor_id,
            "saldo": float(c.saldo),
            "fecha_vencimiento": c.fecha_vencimiento.isoformat() if c.fecha_vencimiento else None,
        }
        for c in rows
    ]


@router.get("/compras")
def listar_compras(
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Compra)
        .filter(Compra.empresa_id == empresa_id)
        .order_by(Compra.fecha_recepcion.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "id": c.id, "folio": c.folio_interno, "proveedor_id": c.proveedor_id,
            "uuid_cfdi": c.uuid_cfdi, "total": float(c.total), "estatus": c.estatus,
        }
        for c in rows
    ]
