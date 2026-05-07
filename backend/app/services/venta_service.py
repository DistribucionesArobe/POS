"""Crear documentos de venta y consolidacion de remisiones en factura."""
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.models import (
    DocumentoVenta, ConceptoVenta, VarianteProducto, Cliente,
    CuentaPorCobrar, Producto,
)
from app.models.venta import TipoDocumento, EstatusDocumento, MetodoPagoSAT
from app.schemas.venta import DocumentoVentaIn
from app.services import inventario_service
from app.utils.folios import siguiente_folio

IVA_TASA = 0.16


def crear_documento(db: Session, payload: DocumentoVentaIn, empresa_id: int) -> DocumentoVenta:
    cliente = db.get(Cliente, payload.cliente_id)
    if not cliente:
        raise ValueError("Cliente no existe")
    if cliente.empresa_id != empresa_id:
        raise ValueError("Cliente pertenece a otra empresa")

    subtotal = 0.0
    conceptos_creados: list[ConceptoVenta] = []
    for c in payload.conceptos:
        v = db.get(VarianteProducto, c.variante_id)
        if not v:
            raise ValueError(f"Variante {c.variante_id} no existe")
        producto = db.get(Producto, v.producto_id)
        if producto.empresa_id != empresa_id:
            raise ValueError(f"Variante {v.sku} pertenece a otra empresa")
        importe = c.cantidad * c.precio_unitario - c.descuento
        subtotal += importe
        conceptos_creados.append(ConceptoVenta(
            variante_id=v.id,
            descripcion=f"{producto.nombre} - {v.presentacion}",
            cantidad=c.cantidad,
            precio_unitario=c.precio_unitario,
            descuento=c.descuento,
            importe=importe,
            clave_prod_serv_sat=producto.clave_prod_serv_sat,
            clave_unidad_sat=v.clave_unidad_sat,
            tasa_iva=IVA_TASA,
        ))

    iva = round(subtotal * IVA_TASA, 2)
    total = round(subtotal + iva, 2)

    doc = DocumentoVenta(
        empresa_id=empresa_id,
        folio=siguiente_folio(db, payload.tipo, empresa_id),
        tipo=payload.tipo,
        estatus=EstatusDocumento.CONFIRMADO.value,
        cliente_id=payload.cliente_id,
        vendedor_id=payload.vendedor_id,
        fecha=datetime.utcnow(),
        subtotal=subtotal,
        iva=iva,
        total=total,
        forma_pago_sat=payload.forma_pago_sat,
        metodo_pago_sat=payload.metodo_pago_sat,
        uso_cfdi=payload.uso_cfdi,
        notas=payload.notas,
    )
    if cliente.dias_credito > 0:
        doc.fecha_vencimiento = doc.fecha + timedelta(days=cliente.dias_credito)
    doc.conceptos = conceptos_creados
    db.add(doc)
    db.flush()

    if payload.tipo in (TipoDocumento.TICKET.value, TipoDocumento.REMISION.value, TipoDocumento.FACTURA.value):
        for c in conceptos_creados:
            tipo_mov = {
                TipoDocumento.TICKET.value: "SALIDA_VENTA",
                TipoDocumento.REMISION.value: "SALIDA_REMISION",
                TipoDocumento.FACTURA.value: "SALIDA_VENTA",
            }[payload.tipo]
            inventario_service.aplicar_movimiento(
                db, c.variante_id, tipo_mov, -float(c.cantidad),
                empresa_id=empresa_id,
                referencia_tipo="DOCUMENTO_VENTA", referencia_id=doc.id,
                usuario_id=payload.vendedor_id,
            )

    if payload.tipo == TipoDocumento.REMISION.value or (
        payload.tipo == TipoDocumento.FACTURA.value and payload.metodo_pago_sat == MetodoPagoSAT.PPD.value
    ):
        cxc = CuentaPorCobrar(
            cliente_id=cliente.id,
            documento_id=doc.id,
            monto_original=total,
            saldo=total,
            fecha_emision=doc.fecha,
            fecha_vencimiento=doc.fecha_vencimiento,
        )
        db.add(cxc)

    db.commit()
    db.refresh(doc)
    return doc


def consolidar_remisiones(db: Session, cliente_id: int, remision_ids: list[int], empresa_id: int) -> DocumentoVenta:
    remisiones = (
        db.query(DocumentoVenta)
        .filter(DocumentoVenta.id.in_(remision_ids))
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .filter(DocumentoVenta.cliente_id == cliente_id)
        .filter(DocumentoVenta.tipo == TipoDocumento.REMISION.value)
        .filter(DocumentoVenta.factura_padre_id.is_(None))
        .all()
    )
    if len(remisiones) != len(remision_ids):
        raise ValueError("Una o mas remisiones invalidas, ya facturadas, o no son del cliente")

    cliente = db.get(Cliente, cliente_id)
    if not cliente or not cliente.rfc:
        raise ValueError("Cliente debe tener RFC para emitir CFDI")
    if cliente.empresa_id != empresa_id:
        raise ValueError("Cliente pertenece a otra empresa")

    subtotal = sum(float(r.subtotal) for r in remisiones)
    iva = sum(float(r.iva) for r in remisiones)
    total = sum(float(r.total) for r in remisiones)

    factura = DocumentoVenta(
        empresa_id=empresa_id,
        folio=siguiente_folio(db, TipoDocumento.FACTURA.value, empresa_id),
        tipo=TipoDocumento.FACTURA.value,
        estatus=EstatusDocumento.CONFIRMADO.value,
        cliente_id=cliente_id,
        fecha=datetime.utcnow(),
        subtotal=subtotal,
        iva=iva,
        total=total,
        notas=f"Consolida remisiones: {', '.join(r.folio for r in remisiones)}",
    )
    for r in remisiones:
        for c in r.conceptos:
            factura.conceptos.append(ConceptoVenta(
                variante_id=c.variante_id,
                descripcion=c.descripcion,
                cantidad=c.cantidad,
                precio_unitario=c.precio_unitario,
                descuento=c.descuento,
                importe=c.importe,
                clave_prod_serv_sat=c.clave_prod_serv_sat,
                clave_unidad_sat=c.clave_unidad_sat,
                tasa_iva=c.tasa_iva,
            ))
        r.factura_padre_id = factura.id
        r.estatus = EstatusDocumento.FACTURADO.value

    db.add(factura)
    db.commit()
    db.refresh(factura)
    return factura
