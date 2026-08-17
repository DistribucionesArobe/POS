"""Crear documentos de venta y consolidacion de remisiones en factura."""
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.models import (
    DocumentoVenta, ConceptoVenta, VarianteProducto, Cliente,
    CuentaPorCobrar, Producto, Pago,
)
from app.models.venta import TipoDocumento, EstatusDocumento, MetodoPagoSAT
from app.schemas.venta import DocumentoVentaIn
from app.services import inventario_service
from app.utils.folios import siguiente_folio

IVA_TASA = 0.16


def _unidad_a_clave_sat(unidad: str) -> str | None:
    """Mapea unidad descriptiva (Pieza, Kg, etc.) -> clave SAT c_ClaveUnidad.

    Si no encuentra match devuelve None para que el caller mantenga
    la clave SAT que ya tenia la variante.
    """
    u = (unidad or "").strip().lower()
    if not u:
        return None
    if u.startswith("pieza") or u == "pza" or u == "pz":
        return "H87"
    if u.startswith("kit"):
        return "XKI"
    if u.startswith("paq"):
        return "XPK"
    if u.startswith("caja"):
        return "XBX"
    if u.startswith("bult"):
        return "XBG"
    if u.startswith("kg") or "kilo" in u:
        return "KGM"
    if u in {"g", "gr"} or u.startswith("gramo"):
        return "GRM"
    if u == "m" or "metro" in u:
        return "MTR"
    if u in {"m2", "m²"} or "metro2" in u or "metro cuadrado" in u:
        return "MTK"
    if u in {"m3", "m³"} or "metro3" in u or "metro cubico" in u:
        return "MTQ"
    if u.startswith("lt") or "litro" in u or u == "l":
        return "LTR"
    if u.startswith("gal"):
        return "GLL"
    if u.startswith("ton"):
        return "TNE"
    if u.startswith("hora") or u == "h" or u == "hr":
        return "HUR"
    if u.startswith("servicio") or u.startswith("serv"):
        return "E48"
    return None


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
        # Resolver clave SAT de unidad: si el concepto manda override de "unidad",
        # tratamos de mapearla; si no hay match usamos la de la variante.
        clave_unidad = v.clave_unidad_sat
        unidad_override = getattr(c, "unidad", None)
        if unidad_override:
            clave_unidad = _unidad_a_clave_sat(unidad_override) or v.clave_unidad_sat
        # Respetar la tasa de IVA por variante (0% para alimentos basicos,
        # 16% general, 8% frontera). Default: 16%.
        tasa_linea = float(v.tasa_iva) if v.tasa_iva is not None else IVA_TASA
        # Descripcion: usa el override del concepto si viene, sino default
        desc_override = getattr(c, "descripcion", None)
        descripcion_final = (
            desc_override.strip()
            if desc_override and desc_override.strip()
            else f"{producto.nombre} - {v.presentacion}"
        )
        conceptos_creados.append(ConceptoVenta(
            variante_id=v.id,
            descripcion=descripcion_final,
            cantidad=c.cantidad,
            precio_unitario=c.precio_unitario,
            descuento=c.descuento,
            importe=importe,
            clave_prod_serv_sat=producto.clave_prod_serv_sat,
            clave_unidad_sat=clave_unidad,
            tasa_iva=tasa_linea,
        ))

    # IVA total = suma del IVA por linea (respetando tasa por variante)
    iva = round(sum(float(c.importe) * float(c.tasa_iva) for c in conceptos_creados), 2)
    # Retenciones (caso CFE / gobierno comprando a PF). Vienen del payload
    # opcionalmente como porcentaje sobre subtotal.
    iva_retenido_pct = float(getattr(payload, "iva_retenido_pct", 0) or 0)
    isr_retenido_pct = float(getattr(payload, "isr_retenido_pct", 0) or 0)
    iva_retenido = round(subtotal * iva_retenido_pct, 2)
    isr_retenido = round(subtotal * isr_retenido_pct, 2)
    total = round(subtotal + iva - iva_retenido - isr_retenido, 2)

    # Resolver forma_pago_sat a partir de pagos[] si se mandaron
    forma_pago_resuelta = payload.forma_pago_sat
    pagos_validados: list = []
    if payload.pagos:
        suma = round(sum(p.monto for p in payload.pagos), 2)
        # Se permite suma >= total (la diferencia es cambio en efectivo).
        # Solo falla si paga MENOS del total.
        if suma < total - 0.01:
            raise ValueError(
                f"La suma de pagos ({suma:.2f}) es menor al total ({total:.2f})"
            )
        pagos_validados = list(payload.pagos)
        if len(pagos_validados) == 1:
            forma_pago_resuelta = pagos_validados[0].forma_pago_sat
        else:
            # SAT 4.0: multiples formas de pago -> "99" Por definir
            forma_pago_resuelta = "99"

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
        iva_retenido=iva_retenido,
        isr_retenido=isr_retenido,
        forma_pago_sat=forma_pago_resuelta,
        metodo_pago_sat=payload.metodo_pago_sat,
        uso_cfdi=payload.uso_cfdi,
        notas=payload.notas,
    )
    if cliente.dias_credito > 0:
        doc.fecha_vencimiento = doc.fecha + timedelta(days=cliente.dias_credito)
    doc.conceptos = conceptos_creados
    db.add(doc)
    db.flush()

    # Registrar pagos (si se mandaron)
    for p in pagos_validados:
        db.add(Pago(
            documento_venta_id=doc.id,
            forma_pago_sat=p.forma_pago_sat,
            monto=p.monto,
            referencia=p.referencia,
        ))

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

    # Acumular puntos de monedero (solo si la empresa lo tiene activo y el cliente
    # es identificado). No rompe la venta si falla.
    try:
        from app.routers.monedero import acumular_puntos_por_venta
        acumular_puntos_por_venta(
            db=db,
            empresa_id=empresa_id,
            cliente_id=payload.cliente_id,
            documento_id=doc.id,
            subtotal=subtotal,
            tipo_documento=payload.tipo,
        )
    except Exception:
        # Silenciar errores del monedero - no debe bloquear la venta
        pass

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


def crear_devolucion(
    db: Session, factura_id: int,
    conceptos_devolver: list[dict], motivo: str | None,
    empresa_id: int,
) -> DocumentoVenta:
    """Crea NOTA_CREDITO referenciando la factura original.

    - Devuelve mercancia al inventario (kardex DEVOLUCION_VENTA +)
    - Reduce CxC si existe (factura PPD o remision facturada)
    - Si no hay CxC, no hace nada con cartera (factura PUE pagada)
    """
    factura = db.get(DocumentoVenta, factura_id)
    if not factura:
        raise ValueError("Factura no existe")
    if factura.empresa_id != empresa_id:
        raise ValueError("Factura pertenece a otra empresa")
    if factura.tipo != TipoDocumento.FACTURA.value:
        raise ValueError("Solo se devuelven facturas")
    if factura.estatus == EstatusDocumento.CANCELADO.value:
        raise ValueError("La factura esta cancelada")

    # Validar cantidades vs conceptos originales
    devolver_map = {c["variante_id"]: float(c["cantidad"]) for c in conceptos_devolver}
    nuevos_conceptos = []
    subtotal_dev = 0.0
    for cv in factura.conceptos:
        cant_dev = devolver_map.get(cv.variante_id, 0)
        if cant_dev <= 0:
            continue
        if cant_dev > float(cv.cantidad):
            raise ValueError(
                f"Cantidad a devolver ({cant_dev}) excede la facturada ({cv.cantidad}) en {cv.descripcion}"
            )
        importe_dev = cant_dev * float(cv.precio_unitario)
        subtotal_dev += importe_dev
        nuevos_conceptos.append({
            "variante_id": cv.variante_id,
            "descripcion": cv.descripcion,
            "cantidad": cant_dev,
            "precio_unitario": float(cv.precio_unitario),
            "importe": importe_dev,
            "clave_prod_serv_sat": cv.clave_prod_serv_sat,
            "clave_unidad_sat": cv.clave_unidad_sat,
            "tasa_iva": float(cv.tasa_iva),
        })

    if not nuevos_conceptos:
        raise ValueError("No hay conceptos a devolver")

    iva_dev = round(subtotal_dev * IVA_TASA, 2)
    total_dev = round(subtotal_dev + iva_dev, 2)

    nc = DocumentoVenta(
        empresa_id=empresa_id,
        folio=siguiente_folio(db, TipoDocumento.NOTA_CREDITO.value, empresa_id),
        tipo=TipoDocumento.NOTA_CREDITO.value,
        estatus=EstatusDocumento.CONFIRMADO.value,
        cliente_id=factura.cliente_id,
        fecha=datetime.utcnow(),
        subtotal=subtotal_dev,
        iva=iva_dev,
        total=total_dev,
        forma_pago_sat=factura.forma_pago_sat,
        metodo_pago_sat="PUE",
        uso_cfdi="G02",  # Devoluciones, descuentos o bonificaciones
        factura_relacionada_id=factura.id,
        notas=motivo,
    )
    for c in nuevos_conceptos:
        nc.conceptos.append(ConceptoVenta(
            variante_id=c["variante_id"],
            descripcion=c["descripcion"],
            cantidad=c["cantidad"],
            precio_unitario=c["precio_unitario"],
            importe=c["importe"],
            clave_prod_serv_sat=c["clave_prod_serv_sat"],
            clave_unidad_sat=c["clave_unidad_sat"],
            tasa_iva=c["tasa_iva"],
        ))
    db.add(nc)
    db.flush()

    # Devolver al inventario
    for c in nuevos_conceptos:
        inventario_service.aplicar_movimiento(
            db, c["variante_id"], "DEVOLUCION_VENTA", c["cantidad"],
            empresa_id=empresa_id,
            referencia_tipo="NOTA_CREDITO", referencia_id=nc.id,
            notas=f"Devolucion de {factura.folio}",
        )

    # Reducir CxC si la factura tenia saldo
    cxc = db.query(CuentaPorCobrar).filter(
        CuentaPorCobrar.documento_id == factura.id,
        CuentaPorCobrar.pagado == False,
    ).first()
    if cxc:
        nuevo_saldo = float(cxc.saldo) - total_dev
        if nuevo_saldo <= 0.01:
            cxc.saldo = 0
            cxc.pagado = True
            factura.estatus = EstatusDocumento.PAGADO.value
        else:
            cxc.saldo = nuevo_saldo

    db.commit()
    db.refresh(nc)
    return nc
