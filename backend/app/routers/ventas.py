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


class ConceptoEditIn(BaseModel):
    id: int  # concepto_venta.id
    descripcion: str | None = None
    cantidad: float | None = None
    precio_unitario: float | None = None
    clave_prod_serv_sat: str | None = None
    clave_unidad_sat: str | None = None
    tasa_iva: float | None = None


class ActualizarPrevisTimbreIn(BaseModel):
    """Payload para actualizar la venta y sus conceptos antes de timbrar."""
    observaciones: str | None = None
    conceptos: list[ConceptoEditIn] | None = None
    uso_cfdi: str | None = None
    metodo_pago_sat: str | None = None
    forma_pago_sat: str | None = None


@router.get("/{documento_id}/detalle-completo")
def detalle_completo_venta(
    documento_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Detalle completo con conceptos ya guardados (para la vista previa antes de timbrar)."""
    doc = db.get(DocumentoVenta, documento_id)
    if not doc:
        raise HTTPException(404, "Venta no existe")
    if doc.empresa_id != empresa_id:
        raise HTTPException(403, "Venta de otra empresa")
    cli = db.get(Cliente, doc.cliente_id)
    emp = db.get(Empresa, doc.empresa_id)
    conceptos = (
        db.query(ConceptoVenta)
        .filter(ConceptoVenta.documento_id == doc.id)
        .order_by(ConceptoVenta.id)
        .all()
    )
    return {
        "id": doc.id, "folio": doc.folio, "tipo": doc.tipo,
        "fecha": doc.fecha.isoformat(),
        "subtotal": float(doc.subtotal), "iva": float(doc.iva), "total": float(doc.total),
        "metodo_pago_sat": doc.metodo_pago_sat,
        "forma_pago_sat": doc.forma_pago_sat,
        "uso_cfdi": doc.uso_cfdi,
        "observaciones": doc.observaciones,
        "cliente": {
            "id": cli.id, "nombre": cli.nombre, "razon_social": cli.razon_social,
            "rfc": cli.rfc, "codigo_postal": cli.codigo_postal,
            "regimen_fiscal": cli.regimen_fiscal, "correo": cli.correo,
        } if cli else None,
        "empresa": {"id": emp.id, "nombre": emp.nombre} if emp else None,
        "conceptos": [
            {
                "id": c.id, "descripcion": c.descripcion,
                "cantidad": float(c.cantidad),
                "precio_unitario": float(c.precio_unitario),
                "importe": float(c.importe),
                "clave_prod_serv_sat": c.clave_prod_serv_sat,
                "clave_unidad_sat": c.clave_unidad_sat,
                "tasa_iva": float(c.tasa_iva) if c.tasa_iva is not None else 0.16,
            }
            for c in conceptos
        ],
    }


@router.patch("/{documento_id}/preparar-timbre")
def preparar_timbre(
    documento_id: int,
    payload: ActualizarPrevisTimbreIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Aplica cambios de la vista previa a una FACTURA antes de timbrarla.
    Modifica descripcion/cant/precio/clave SAT/unidad/tasa IVA por concepto.
    Tambien actualiza observaciones, uso_cfdi, metodo/forma pago del documento."""
    doc = db.get(DocumentoVenta, documento_id)
    if not doc:
        raise HTTPException(404, "Venta no existe")
    if doc.empresa_id != empresa_id:
        raise HTTPException(403, "Venta de otra empresa")
    if doc.tipo != "FACTURA":
        raise HTTPException(400, "Solo se preparan facturas")
    # Verificar que no este timbrada aun
    cfdi = db.query(Cfdi).filter(Cfdi.documento_venta_id == doc.id).first()
    if cfdi and not cfdi.cancelado:
        raise HTTPException(400, "Ya esta timbrada; no se puede modificar")

    # Actualizar campos del documento
    if payload.observaciones is not None:
        doc.observaciones = payload.observaciones.strip() or None
    if payload.uso_cfdi is not None:
        doc.uso_cfdi = payload.uso_cfdi.strip() or None
    if payload.metodo_pago_sat is not None:
        doc.metodo_pago_sat = payload.metodo_pago_sat
        if payload.metodo_pago_sat == "PPD":
            doc.forma_pago_sat = "99"
    if payload.forma_pago_sat is not None and (doc.metodo_pago_sat or "") != "PPD":
        doc.forma_pago_sat = payload.forma_pago_sat

    # Actualizar conceptos
    if payload.conceptos:
        nuevo_subtotal = 0.0
        nuevo_iva = 0.0
        for cin in payload.conceptos:
            cv = db.get(ConceptoVenta, cin.id)
            if not cv or cv.documento_id != doc.id:
                continue  # ignora conceptos que no pertenecen
            if cin.descripcion is not None:
                cv.descripcion = cin.descripcion.strip() or cv.descripcion
            if cin.cantidad is not None and cin.cantidad > 0:
                cv.cantidad = cin.cantidad
            if cin.precio_unitario is not None and cin.precio_unitario >= 0:
                cv.precio_unitario = cin.precio_unitario
            if cin.clave_prod_serv_sat is not None:
                cv.clave_prod_serv_sat = cin.clave_prod_serv_sat.strip() or cv.clave_prod_serv_sat
            if cin.clave_unidad_sat is not None:
                cv.clave_unidad_sat = cin.clave_unidad_sat.strip() or cv.clave_unidad_sat
            if cin.tasa_iva is not None:
                cv.tasa_iva = cin.tasa_iva
            # Recalcular importe
            cv.importe = round(float(cv.cantidad) * float(cv.precio_unitario), 2)
        # Recalcular totales del doc con TODOS los conceptos actualizados
        todos = db.query(ConceptoVenta).filter(ConceptoVenta.documento_id == doc.id).all()
        for c in todos:
            nuevo_subtotal += float(c.importe)
            nuevo_iva += float(c.importe) * float(c.tasa_iva or 0.16)
        doc.subtotal = round(nuevo_subtotal, 2)
        doc.iva = round(nuevo_iva, 2)
        doc.total = round(nuevo_subtotal + nuevo_iva, 2)
    db.commit()
    return {
        "ok": True,
        "subtotal": float(doc.subtotal),
        "iva": float(doc.iva),
        "total": float(doc.total),
    }


class ObservacionesIn(BaseModel):
    observaciones: str | None = None


@router.patch("/{documento_id}/observaciones")
def editar_observaciones(
    documento_id: int,
    payload: ObservacionesIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Edita las observaciones de una venta. Funciona incluso con CFDI timbrado
    porque las observaciones NO forman parte del XML fiscal.
    Solo cambia el PDF propio del CFDI (el que generamos nosotros).
    El UUID, el sello SAT y todo lo legal quedan intactos."""
    doc = db.get(DocumentoVenta, documento_id)
    if not doc:
        raise HTTPException(404, "Venta no existe")
    if doc.empresa_id != empresa_id:
        raise HTTPException(403, "Venta de otra empresa")
    doc.observaciones = (payload.observaciones or "").strip() or None
    db.commit()
    return {"ok": True, "observaciones": doc.observaciones}


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


class DuplicarIn(BaseModel):
    # Overrides opcionales - si no se mandan se usa lo de la venta original
    metodo_pago_sat: str | None = None  # 'PUE' o 'PPD'
    forma_pago_sat: str | None = None   # '01', '03', '99', etc.
    uso_cfdi: str | None = None
    cliente_id: int | None = None


@router.post("/{documento_id}/duplicar")
def duplicar_venta(
    documento_id: int,
    payload: DuplicarIn | None = None,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Duplica una venta existente creando una nueva CONFIRMADO con los
    mismos conceptos y cliente. Sin CFDI, sin pagos, folio nuevo.
    Puede recibir overrides opcionales (metodo_pago_sat, forma_pago_sat,
    uso_cfdi, cliente_id) para cambiar datos al duplicar.
    Util cuando cancelas un CFDI mal timbrado y quieres re-timbrarlo con
    correcciones (por ejemplo unidades, claves SAT, PUE->PPD, etc.)."""
    from app.models import ConceptoVenta as ConceptoVentaModel
    doc = db.get(DocumentoVenta, documento_id)
    if not doc:
        raise HTTPException(404, "Venta no existe")
    if doc.empresa_id != empresa_id:
        raise HTTPException(403, "Venta de otra empresa")

    # Reconstruimos el payload con los conceptos usando los datos actuales del
    # catalogo (para que la duplicada tome unidades/tasas/claves ACTUALIZADAS).
    conceptos_originales = db.query(ConceptoVentaModel).filter(
        ConceptoVentaModel.documento_id == documento_id
    ).order_by(ConceptoVentaModel.id).all()
    if not conceptos_originales:
        raise HTTPException(400, "La venta original no tiene conceptos")

    # Resolver overrides con fallback a lo de la venta original
    over = payload or DuplicarIn()
    metodo = over.metodo_pago_sat or doc.metodo_pago_sat or "PUE"
    # Si cambio metodo a PPD, la forma_pago debe ser "99" (Por definir) segun SAT
    if metodo == "PPD":
        forma = "99"
    else:
        forma = over.forma_pago_sat or doc.forma_pago_sat or "01"
    uso = over.uso_cfdi or doc.uso_cfdi
    cliente_id = over.cliente_id or doc.cliente_id

    from app.schemas.venta import ConceptoVentaIn
    doc_payload = DocumentoVentaIn(
        tipo=doc.tipo,
        cliente_id=cliente_id,
        forma_pago_sat=forma,
        metodo_pago_sat=metodo,
        uso_cfdi=uso,
        notas=(doc.notas or "") + f" [Duplicada de {doc.folio}]",
        conceptos=[
            ConceptoVentaIn(
                variante_id=c.variante_id,
                cantidad=float(c.cantidad),
                precio_unitario=float(c.precio_unitario),
                descuento=float(c.descuento or 0),
            )
            for c in conceptos_originales
        ],
        iva_retenido_pct=float(getattr(doc, "iva_retenido", 0) or 0) / float(doc.subtotal or 1) if doc.subtotal else 0,
        isr_retenido_pct=float(getattr(doc, "isr_retenido", 0) or 0) / float(doc.subtotal or 1) if doc.subtotal else 0,
    )
    payload = doc_payload  # alias para no romper la referencia abajo
    try:
        nueva = venta_service.crear_documento(db, payload, empresa_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {
        "ok": True,
        "id": nueva.id,
        "folio": nueva.folio,
        "total": float(nueva.total),
        "duplicada_de": doc.folio,
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
            "observaciones": d.observaciones,
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
