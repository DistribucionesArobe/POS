"""Compras y cuentas por pagar - filtrado por empresa."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import CuentaPorPagar, Compra, Proveedor
from app.schemas.compra import CompraIn, AbonoCxPIn
from app.services import compra_service
from app.services.security import get_active_empresa_id

router = APIRouter()


@router.get("/cartera")
def cartera_proveedores(
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(CuentaPorPagar, Proveedor, Compra)
        .join(Compra, Compra.id == CuentaPorPagar.compra_id)
        .join(Proveedor, Proveedor.id == CuentaPorPagar.proveedor_id)
        .filter(Compra.empresa_id == empresa_id)
        .filter(CuentaPorPagar.pagado == False)
        .all()
    )
    return [
        {
            "cxp_id": cxp.id, "proveedor_id": prov.id, "proveedor": prov.nombre,
            "compra_id": cxp.compra_id, "compra_folio": comp.folio_interno,
            "monto_original": float(cxp.monto_original),
            "saldo": float(cxp.saldo),
            "fecha_vencimiento": cxp.fecha_vencimiento.isoformat() if cxp.fecha_vencimiento else None,
        }
        for cxp, prov, comp in rows
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
            "uuid_cfdi": c.uuid_cfdi,
            "folio_factura_proveedor": c.folio_factura_proveedor,
            "subtotal": float(c.subtotal), "iva": float(c.iva), "total": float(c.total),
            "estatus": c.estatus,
            "fecha_recepcion": c.fecha_recepcion.isoformat(),
        }
        for c in rows
    ]


@router.get("/compras/{compra_id}")
def obtener_compra(
    compra_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    compra = (
        db.query(Compra)
        .options(joinedload(Compra.conceptos))
        .filter(Compra.id == compra_id, Compra.empresa_id == empresa_id)
        .first()
    )
    if not compra:
        raise HTTPException(404, "Compra no existe")
    return {
        "id": compra.id, "folio": compra.folio_interno,
        "proveedor_id": compra.proveedor_id,
        "uuid_cfdi": compra.uuid_cfdi,
        "folio_factura_proveedor": compra.folio_factura_proveedor,
        "fecha_recepcion": compra.fecha_recepcion.isoformat(),
        "subtotal": float(compra.subtotal), "iva": float(compra.iva), "total": float(compra.total),
        "estatus": compra.estatus,
        "notas": compra.notas,
        "conceptos": [
            {
                "id": c.id, "variante_id": c.variante_id,
                "descripcion": c.descripcion,
                "cantidad": float(c.cantidad),
                "costo_unitario": float(c.costo_unitario),
                "importe": float(c.importe),
            }
            for c in compra.conceptos
        ],
    }


@router.post("/compras")
def crear_compra(
    payload: CompraIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    try:
        compra = compra_service.crear_compra(db, payload, empresa_id)
        return {"id": compra.id, "folio": compra.folio_interno, "total": float(compra.total)}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/abono")
def registrar_abono(
    payload: AbonoCxPIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    try:
        a = compra_service.aplicar_abono_cxp(db, payload, empresa_id)
        return {"id": a.id, "monto": float(a.monto)}
    except ValueError as e:
        raise HTTPException(400, str(e))
