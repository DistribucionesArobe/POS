"""Logica de compras: recepcion mercancia + kardex + CxP + costo promedio."""
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.models import (
    Compra, ConceptoCompra, CuentaPorPagar, AbonoCxP,
    VarianteProducto, Producto, Proveedor,
)
from app.schemas.compra import CompraIn, AbonoCxPIn
from app.services import inventario_service

IVA_TASA = 0.16


def crear_compra(db: Session, payload: CompraIn, empresa_id: int) -> Compra:
    proveedor = db.get(Proveedor, payload.proveedor_id)
    if not proveedor or proveedor.empresa_id != empresa_id:
        raise ValueError("Proveedor no existe o pertenece a otra empresa")

    conceptos_data = []
    for c in payload.conceptos:
        v = db.get(VarianteProducto, c.variante_id)
        if not v:
            raise ValueError(f"Variante {c.variante_id} no existe")
        producto = db.get(Producto, v.producto_id)
        if producto.empresa_id != empresa_id:
            raise ValueError(f"Variante {v.sku} pertenece a otra empresa")
        conceptos_data.append({
            "variante": v,
            "producto": producto,
            "cantidad": float(c.cantidad),
            "costo_unitario": float(c.costo_unitario),
            "descripcion": c.descripcion or f"{producto.nombre} - {v.presentacion}",
        })

    subtotal = sum(c["cantidad"] * c["costo_unitario"] for c in conceptos_data)
    iva = round(subtotal * IVA_TASA, 2) if payload.con_iva else 0
    total = round(subtotal + iva, 2)

    n = (
        db.query(Compra).filter(Compra.empresa_id == empresa_id).count() + 1
    )
    folio_interno = f"E{empresa_id}-C-{n:06d}"

    compra = Compra(
        empresa_id=empresa_id,
        folio_interno=folio_interno,
        proveedor_id=payload.proveedor_id,
        uuid_cfdi=payload.uuid_cfdi,
        folio_factura_proveedor=payload.folio_factura_proveedor,
        fecha_factura=payload.fecha_factura,
        fecha_recepcion=datetime.utcnow(),
        subtotal=subtotal,
        iva=iva,
        total=total,
        estatus="RECIBIDA",
        notas=payload.notas,
    )
    db.add(compra)
    db.flush()

    for cd in conceptos_data:
        importe = cd["cantidad"] * cd["costo_unitario"]
        db.add(ConceptoCompra(
            compra_id=compra.id,
            variante_id=cd["variante"].id,
            descripcion=cd["descripcion"],
            cantidad=cd["cantidad"],
            costo_unitario=cd["costo_unitario"],
            importe=importe,
        ))

        # Snapshot ANTES de aplicar al kardex
        old_stock = float(cd["variante"].stock_actual)
        old_cost = float(cd["variante"].costo_promedio)

        # Aplica entrada al kardex (modifica stock_actual)
        inventario_service.aplicar_movimiento(
            db, cd["variante"].id, "ENTRADA_COMPRA", cd["cantidad"],
            empresa_id=empresa_id,
            referencia_tipo="COMPRA", referencia_id=compra.id,
            costo_unitario=cd["costo_unitario"],
            notas=f"Compra {folio_interno}",
        )

        # Costo promedio ponderado
        new_total = old_stock + cd["cantidad"]
        if new_total > 0:
            nuevo_promedio = (
                old_stock * old_cost + cd["cantidad"] * cd["costo_unitario"]
            ) / new_total
            cd["variante"].costo_promedio = round(nuevo_promedio, 4)

    # CxP
    fecha_venc = None
    if proveedor.dias_credito > 0:
        fecha_venc = datetime.utcnow() + timedelta(days=proveedor.dias_credito)

    cxp = CuentaPorPagar(
        proveedor_id=proveedor.id,
        compra_id=compra.id,
        monto_original=total,
        saldo=total,
        fecha_vencimiento=fecha_venc,
    )
    db.add(cxp)

    db.commit()
    db.refresh(compra)
    return compra


def aplicar_abono_cxp(db: Session, payload: AbonoCxPIn, empresa_id: int) -> AbonoCxP:
    cxp = db.get(CuentaPorPagar, payload.cxp_id)
    if not cxp or cxp.pagado:
        raise ValueError("CxP no existe o ya esta pagada")
    compra = db.get(Compra, cxp.compra_id)
    if not compra or compra.empresa_id != empresa_id:
        raise ValueError("CxP pertenece a otra empresa")
    if payload.monto > float(cxp.saldo) + 0.01:
        raise ValueError(f"Monto excede saldo ({cxp.saldo})")

    abono = AbonoCxP(
        cxp_id=cxp.id,
        monto=payload.monto,
        forma_pago=payload.forma_pago,
        referencia=payload.referencia,
        notas=payload.notas,
    )
    cxp.saldo = float(cxp.saldo) - payload.monto
    if cxp.saldo <= 0.01:
        cxp.pagado = True
        compra.estatus = "PAGADA"

    db.add(abono)
    db.commit()
    db.refresh(abono)
    return abono
