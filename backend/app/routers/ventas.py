"""Ventas: ticket, remision, factura - filtrado por empresa."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import (
    DocumentoVenta, ConceptoVenta, Cliente, Empresa, Pago,
    CuentaPorCobrar, VarianteProducto, Producto, Cfdi,
)
from app.models.venta import TipoDocumento, EstatusDocumento, MetodoPagoSAT, FormaPagoSAT
from app.schemas.venta import DocumentoVentaIn, DocumentoVentaOut, DevolucionIn
from app.services import venta_service, pdf_service, inventario_service
from app.services.security import get_active_empresa_id
from app.utils.folios import siguiente_folio

router = APIRouter()

IVA_TASA = 0.16


class CambiarClienteIn(BaseModel):
    cliente_id: int


@router.patch("/{documento_id}/cliente")
def cambiar_cliente_venta(
    documento_id: int,
    payload: CambiarClienteIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Cambia el cliente (receptor) de una FACTURA que aun NO se ha timbrado.
    Util cuando el cobro se hizo al cliente equivocado y Facturama rechazo el timbre.
    Bloqueado si ya hay CFDI vigente (no cancelado)."""
    doc = db.get(DocumentoVenta, documento_id)
    if not doc:
        raise HTTPException(404, "Venta no existe")
    if doc.empresa_id != empresa_id:
        raise HTTPException(403, "Venta de otra empresa")
    if doc.tipo != "FACTURA":
        raise HTTPException(400, "Solo se puede cambiar cliente en FACTURAS")

    # Verifica que no haya CFDI vigente
    cfdi = db.query(Cfdi).filter(Cfdi.documento_venta_id == doc.id).first()
    if cfdi and not cfdi.cancelado:
        raise HTTPException(400, "No se puede cambiar cliente: la factura ya tiene CFDI timbrado")

    # Verifica que el cliente nuevo exista y sea de la misma empresa
    nuevo = db.get(Cliente, payload.cliente_id)
    if not nuevo:
        raise HTTPException(400, "Cliente no existe")
    if nuevo.empresa_id != empresa_id:
        raise HTTPException(403, "Cliente pertenece a otra empresa")
    if not nuevo.rfc:
        raise HTTPException(400, "El cliente nuevo debe tener RFC para poder facturar")

    doc.cliente_id = payload.cliente_id

    # Si tenia CxC asociada (PPD), tambien hay que moverla al nuevo cliente
    cxc = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.documento_id == doc.id).first()
    if cxc:
        cxc.cliente_id = payload.cliente_id

    db.commit()
    return {
        "ok": True,
        "documento_id": doc.id,
        "cliente_id": nuevo.id,
        "cliente_nombre": nuevo.razon_social or nuevo.nombre,
        "cliente_rfc": nuevo.rfc,
    }


@router.post("", response_model=DocumentoVentaOut)
def crear_venta(
    payload: DocumentoVentaIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    try:
        return venta_service.crear_documento(db, payload, empresa_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("")
def listar_ventas(
    tipo: str | None = Query(None),
    cliente_id: int | None = None,
    estatus: str | None = None,
    q: str | None = Query(None, description="Búsqueda por nombre de cliente, RFC o folio"),
    solo_pendientes: bool = False,  # solo remisiones sin facturar
    limit: int = 200,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    query = (
        db.query(DocumentoVenta, Cliente)
        .join(Cliente, Cliente.id == DocumentoVenta.cliente_id)
        .filter(DocumentoVenta.empresa_id == empresa_id)
    )
    if tipo:
        query = query.filter(DocumentoVenta.tipo == tipo)
    if cliente_id:
        query = query.filter(DocumentoVenta.cliente_id == cliente_id)
    if estatus:
        query = query.filter(DocumentoVenta.estatus == estatus)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            Cliente.nombre.ilike(like),
            Cliente.rfc.ilike(like),
            DocumentoVenta.folio.ilike(like),
        ))
    if solo_pendientes:
        query = query.filter(
            DocumentoVenta.factura_padre_id.is_(None),
            DocumentoVenta.estatus != EstatusDocumento.CANCELADO.value,
        )

    rows = query.order_by(DocumentoVenta.fecha.desc()).limit(limit).all()
    out = []
    for d, cli in rows:
        # Saldo si tiene CxC
        cxc = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.documento_id == d.id).first()
        saldo = float(cxc.saldo) if cxc and not cxc.pagado else 0.0
        out.append({
            "id": d.id, "folio": d.folio, "tipo": d.tipo, "estatus": d.estatus,
            "cliente_id": d.cliente_id, "cliente_nombre": cli.nombre, "cliente_rfc": cli.rfc,
            "fecha": d.fecha.isoformat(),
            "subtotal": float(d.subtotal), "iva": float(d.iva), "total": float(d.total),
            "saldo": saldo, "facturada": d.factura_padre_id is not None,
            "metodo_pago_sat": d.metodo_pago_sat,
        })
    return out


@router.get("/agrupado-por-cliente")
def ventas_agrupadas_por_cliente(
    tipo: str | None = Query(None),
    solo_pendientes: bool = True,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Agrupa ventas por cliente con total y saldo. Útil para la pantalla
    de remisiones donde quieres ver 'cuanto te debe cada uno'."""
    query = (
        db.query(DocumentoVenta, Cliente)
        .join(Cliente, Cliente.id == DocumentoVenta.cliente_id)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .filter(DocumentoVenta.estatus != EstatusDocumento.CANCELADO.value)
    )
    if tipo:
        query = query.filter(DocumentoVenta.tipo == tipo)
    if solo_pendientes:
        query = query.filter(DocumentoVenta.factura_padre_id.is_(None))

    rows = query.order_by(DocumentoVenta.fecha.desc()).all()
    grupos: dict[int, dict] = {}
    for d, cli in rows:
        if cli.id not in grupos:
            grupos[cli.id] = {
                "cliente_id": cli.id, "cliente_nombre": cli.nombre,
                "cliente_rfc": cli.rfc, "whatsapp": cli.whatsapp,
                "documentos": [], "total_documentos": 0.0, "total_saldo": 0.0,
            }
        cxc = db.query(CuentaPorCobrar).filter(CuentaPorCobrar.documento_id == d.id).first()
        saldo = float(cxc.saldo) if cxc and not cxc.pagado else 0.0
        grupos[cli.id]["documentos"].append({
            "id": d.id, "folio": d.folio, "tipo": d.tipo, "estatus": d.estatus,
            "fecha": d.fecha.isoformat(),
            "total": float(d.total), "saldo": saldo,
            "facturada": d.factura_padre_id is not None,
        })
        grupos[cli.id]["total_documentos"] += float(d.total)
        grupos[cli.id]["total_saldo"] += saldo
    return sorted(grupos.values(), key=lambda g: -g["total_saldo"])


@router.get("/remisiones-pendientes/{cliente_id}")
def remisiones_pendientes_facturar(
    cliente_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(DocumentoVenta)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .filter(DocumentoVenta.cliente_id == cliente_id)
        .filter(DocumentoVenta.tipo == TipoDocumento.REMISION.value)
        .filter(DocumentoVenta.factura_padre_id.is_(None))
        .filter(DocumentoVenta.estatus != EstatusDocumento.CANCELADO.value)
        .order_by(DocumentoVenta.fecha)
        .all()
    )
    return [
        {"id": r.id, "folio": r.folio, "fecha": r.fecha.isoformat(), "total": float(r.total)}
        for r in rows
    ]


class ConceptoEdit(BaseModel):
    variante_id: int
    descripcion: str
    cantidad: float = Field(gt=0)
    precio_unitario: float = Field(ge=0)


class ConvertirRemisionesIn(BaseModel):
    remision_ids: list[int] = Field(min_length=1)
    tipo_destino: str  # TICKET o FACTURA
    metodo_pago_sat: str = "PUE"  # PUE o PPD (solo aplica si tipo=FACTURA)
    forma_pago_sat: str = "01"
    uso_cfdi: str | None = None
    conceptos: list[ConceptoEdit]  # con precios ya editados
    timbrar: bool = False  # solo si tipo=FACTURA
    notas: str | None = None


@router.get("/preview-conversion")
def preview_conversion(
    remision_ids: str,  # comma separated
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Pre-llena los conceptos a partir de remisiones, agregando cantidades
    del mismo SKU. Devuelve cliente y lista de conceptos editables."""
    ids = [int(x) for x in remision_ids.split(",") if x.strip().isdigit()]
    if not ids:
        raise HTTPException(400, "remision_ids vacio")
    remisiones = (
        db.query(DocumentoVenta)
        .options(joinedload(DocumentoVenta.conceptos))
        .filter(DocumentoVenta.id.in_(ids))
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .filter(DocumentoVenta.tipo == TipoDocumento.REMISION.value)
        .filter(DocumentoVenta.factura_padre_id.is_(None))
        .all()
    )
    if len(remisiones) != len(ids):
        raise HTTPException(400, "Algunas remisiones no existen o ya estan facturadas")
    cli_ids = {r.cliente_id for r in remisiones}
    if len(cli_ids) > 1:
        raise HTTPException(400, "Las remisiones son de clientes distintos")
    cliente = db.get(Cliente, cli_ids.pop())

    # Sumar conceptos por (variante_id, precio_unitario)
    bucket: dict[tuple[int, float], dict] = {}
    for r in remisiones:
        for c in r.conceptos:
            key = (c.variante_id, float(c.precio_unitario))
            if key not in bucket:
                bucket[key] = {
                    "variante_id": c.variante_id,
                    "descripcion": c.descripcion,
                    "cantidad": 0.0,
                    "precio_unitario": float(c.precio_unitario),
                }
            bucket[key]["cantidad"] += float(c.cantidad)

    return {
        "cliente": {
            "id": cliente.id, "nombre": cliente.nombre, "rfc": cliente.rfc,
            "razon_social": cliente.razon_social, "regimen_fiscal": cliente.regimen_fiscal,
            "codigo_postal": cliente.codigo_postal, "correo": cliente.correo,
            "uso_cfdi_default": cliente.uso_cfdi_default,
        },
        "remisiones": [
            {"id": r.id, "folio": r.folio, "total": float(r.total)}
            for r in remisiones
        ],
        "conceptos": list(bucket.values()),
    }


@router.post("/desde-remisiones")
def convertir_remisiones(
    payload: ConvertirRemisionesIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Crea TICKET o FACTURA a partir de una o varias REMISIONES, con
    conceptos editables (cantidades y precios). Marca las remisiones como facturadas."""
    if payload.tipo_destino not in ("TICKET", "FACTURA"):
        raise HTTPException(400, "tipo_destino debe ser TICKET o FACTURA")

    remisiones = (
        db.query(DocumentoVenta)
        .filter(DocumentoVenta.id.in_(payload.remision_ids))
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .filter(DocumentoVenta.tipo == TipoDocumento.REMISION.value)
        .filter(DocumentoVenta.factura_padre_id.is_(None))
        .all()
    )
    if len(remisiones) != len(payload.remision_ids):
        raise HTTPException(400, "Alguna remisión no existe o ya fue facturada")
    cli_ids = {r.cliente_id for r in remisiones}
    if len(cli_ids) > 1:
        raise HTTPException(400, "Las remisiones son de clientes distintos")
    cliente = db.get(Cliente, cli_ids.pop())
    if payload.tipo_destino == "FACTURA" and not (cliente and cliente.rfc):
        raise HTTPException(400, "Para FACTURA el cliente debe tener RFC")

    # Construir conceptos con cantidades y precios EDITADOS
    subtotal = 0.0
    conceptos_creados: list[ConceptoVenta] = []
    for c in payload.conceptos:
        v = db.get(VarianteProducto, c.variante_id)
        if not v:
            raise HTTPException(400, f"Variante {c.variante_id} no existe")
        producto = db.get(Producto, v.producto_id)
        if producto.empresa_id != empresa_id:
            raise HTTPException(403, "Variante de otra empresa")
        importe = round(c.cantidad * c.precio_unitario, 2)
        subtotal += importe
        conceptos_creados.append(ConceptoVenta(
            variante_id=v.id,
            descripcion=c.descripcion,
            cantidad=c.cantidad,
            precio_unitario=c.precio_unitario,
            descuento=0,
            importe=importe,
            clave_prod_serv_sat=producto.clave_prod_serv_sat,
            clave_unidad_sat=v.clave_unidad_sat,
            tasa_iva=IVA_TASA,
        ))

    iva = round(subtotal * IVA_TASA, 2)
    total = round(subtotal + iva, 2)

    nuevo = DocumentoVenta(
        empresa_id=empresa_id,
        folio=siguiente_folio(db, payload.tipo_destino, empresa_id),
        tipo=payload.tipo_destino,
        estatus=EstatusDocumento.CONFIRMADO.value,
        cliente_id=cliente.id,
        fecha=datetime.utcnow(),
        subtotal=subtotal, iva=iva, total=total,
        forma_pago_sat=payload.forma_pago_sat,
        metodo_pago_sat=payload.metodo_pago_sat,
        uso_cfdi=payload.uso_cfdi or cliente.uso_cfdi_default,
        notas=payload.notas or f"Generada desde remisiones: {', '.join(r.folio for r in remisiones)}",
    )
    nuevo.conceptos = conceptos_creados
    db.add(nuevo)
    db.flush()

    # NO se descuenta inventario otra vez (ya se descontó al crear la REMISION)

    # Marcar remisiones como facturadas
    for r in remisiones:
        r.factura_padre_id = nuevo.id
        r.estatus = EstatusDocumento.FACTURADO.value
        # Si tenían CxC abierta, cerrarla (el saldo pasa al nuevo doc si es PPD/REMISION→FACTURA)
        cxc = db.query(CuentaPorCobrar).filter(
            CuentaPorCobrar.documento_id == r.id,
            CuentaPorCobrar.pagado == False,
        ).first()
        if cxc:
            cxc.pagado = True  # cerramos la de la remision; abajo creamos una nueva si aplica

    # Si el nuevo doc es a credito (FACTURA-PPD), abrir nueva CxC
    if payload.tipo_destino == "FACTURA" and payload.metodo_pago_sat == "PPD":
        db.add(CuentaPorCobrar(
            cliente_id=cliente.id,
            documento_id=nuevo.id,
            monto_original=total,
            saldo=total,
            fecha_emision=nuevo.fecha,
        ))

    db.commit()
    db.refresh(nuevo)

    result = {
        "id": nuevo.id, "folio": nuevo.folio, "tipo": nuevo.tipo,
        "total": float(nuevo.total),
        "remisiones_facturadas": [r.folio for r in remisiones],
    }

    # Timbrar si pidieron
    if payload.timbrar and payload.tipo_destino == "FACTURA":
        try:
            from app.services import cfdi_service
            t = cfdi_service.timbrar(db, nuevo.id, empresa_id)
            result["cfdi"] = t
        except Exception as e:
            result["cfdi_error"] = str(e)

    return result


@router.post("/consolidar-factura")
def consolidar_remisiones_en_factura(
    cliente_id: int,
    remision_ids: list[int],
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    try:
        return venta_service.consolidar_remisiones(db, cliente_id, remision_ids, empresa_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/{documento_id}/conceptos")
def conceptos_de_documento(
    documento_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    doc = (
        db.query(DocumentoVenta)
        .options(joinedload(DocumentoVenta.conceptos))
        .filter(DocumentoVenta.id == documento_id)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .first()
    )
    if not doc:
        raise HTTPException(404, "Documento no existe")
    return [
        {
            "id": c.id, "variante_id": c.variante_id,
            "descripcion": c.descripcion,
            "cantidad": float(c.cantidad),
            "precio_unitario": float(c.precio_unitario),
            "importe": float(c.importe),
        }
        for c in doc.conceptos
    ]


@router.get("/{documento_id}/pagos")
def pagos_de_documento(
    documento_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    doc = (
        db.query(DocumentoVenta)
        .filter(DocumentoVenta.id == documento_id)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .first()
    )
    if not doc:
        raise HTTPException(404, "Documento no existe")
    pagos = db.query(Pago).filter(Pago.documento_venta_id == documento_id).order_by(Pago.id).all()
    return [
        {
            "id": p.id, "forma_pago_sat": p.forma_pago_sat,
            "monto": float(p.monto), "referencia": p.referencia,
        }
        for p in pagos
    ]


@router.post("/devolucion")
def crear_devolucion(
    payload: DevolucionIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Crea NOTA_CREDITO desde una factura. Devuelve inventario y reduce CxC."""
    try:
        nc = venta_service.crear_devolucion(
            db, payload.factura_id,
            [{"variante_id": c.variante_id, "cantidad": c.cantidad} for c in payload.conceptos],
            payload.motivo, empresa_id,
        )
        result = {
            "id": nc.id, "folio": nc.folio, "total": float(nc.total),
            "factura_relacionada_id": nc.factura_relacionada_id,
        }
        # Opcional: timbrar CFDI Egreso si el usuario lo pidio
        if payload.timbrar_cfdi_egreso:
            try:
                from app.services import cfdi_service
                cfdi_result = cfdi_service.emitir_nota_credito_cfdi(db, nc.id, empresa_id)
                result["cfdi"] = cfdi_result
            except Exception as e:
                result["cfdi_error"] = str(e)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/{documento_id}/pdf")
def descargar_pdf(
    documento_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    doc = (
        db.query(DocumentoVenta)
        .options(joinedload(DocumentoVenta.conceptos))
        .filter(DocumentoVenta.id == documento_id)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .first()
    )
    if not doc:
        raise HTTPException(404, "Documento no existe")
    cliente = db.get(Cliente, doc.cliente_id)
    empresa = db.get(Empresa, doc.empresa_id)
    pdf_bytes = pdf_service.generar_pdf_documento(doc, cliente, empresa)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={doc.folio}.pdf"},
    )
