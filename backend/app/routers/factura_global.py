"""Factura Global: convierte tickets de mostrador en 1 CFDI al publico en general."""
from datetime import datetime, date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import DocumentoVenta, Empresa, Usuario, Cfdi
from app.services.security import get_active_empresa_id, get_current_user
from app.integrations.facturama import FacturamaClient

router = APIRouter(prefix="/factura-global", tags=["factura-global"])


PERIODICIDAD_LABEL = {
    "01": "Diario", "02": "Semanal", "03": "Quincenal",
    "04": "Mensual", "05": "Bimestral",
}


@router.get("/pendientes")
def listar_pendientes(
    fecha_inicio: date,
    fecha_fin: date,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Tickets no cancelados del rango que no han sido incluidos en una factura global."""
    ini = datetime.combine(fecha_inicio, datetime.min.time())
    fin = datetime.combine(fecha_fin, datetime.min.time()) + timedelta(days=1)
    tickets = (
        db.query(DocumentoVenta)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .filter(DocumentoVenta.tipo == "TICKET")
        .filter(DocumentoVenta.fecha >= ini, DocumentoVenta.fecha < fin)
        .filter(DocumentoVenta.estatus != "CANCELADO")
        .filter(DocumentoVenta.factura_global_id.is_(None))
        .order_by(DocumentoVenta.fecha)
        .all()
    )
    return {
        "n_tickets": len(tickets),
        "total_subtotal": round(sum(float(t.subtotal or 0) for t in tickets), 2),
        "total_iva": round(sum(float(t.iva or 0) for t in tickets), 2),
        "total": round(sum(float(t.total or 0) for t in tickets), 2),
        "tickets": [{
            "id": t.id, "folio": t.folio,
            "fecha": t.fecha.isoformat() if t.fecha else None,
            "subtotal": float(t.subtotal or 0),
            "iva": float(t.iva or 0),
            "total": float(t.total or 0),
        } for t in tickets],
    }


class GenerarFacturaGlobalIn(BaseModel):
    fecha_inicio: date
    fecha_fin: date
    periodicidad: str   # 01 diario | 02 semanal | 03 quincenal | 04 mensual | 05 bimestral
    mes: str            # '01'..'12' o codigos SAT bimestrales
    anio: int


@router.post("/generar")
def generar_factura_global(
    payload: GenerarFacturaGlobalIn,
    empresa_id: int = Depends(get_active_empresa_id),
    usuario: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Genera y timbra el CFDI de factura global, ligando los tickets incluidos."""
    empresa = db.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(404, "Empresa no existe")

    ini = datetime.combine(payload.fecha_inicio, datetime.min.time())
    fin = datetime.combine(payload.fecha_fin, datetime.min.time()) + timedelta(days=1)
    tickets = (
        db.query(DocumentoVenta)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .filter(DocumentoVenta.tipo == "TICKET")
        .filter(DocumentoVenta.fecha >= ini, DocumentoVenta.fecha < fin)
        .filter(DocumentoVenta.estatus != "CANCELADO")
        .filter(DocumentoVenta.factura_global_id.is_(None))
        .all()
    )
    if not tickets:
        raise HTTPException(400, "No hay tickets pendientes en el rango")

    client = FacturamaClient(empresa)

    try:
        resp = client.emitir_factura_global(
            tickets=tickets,
            periodicidad=payload.periodicidad,
            mes=payload.mes,
            anio=payload.anio,
        )
    except Exception as e:
        raise HTTPException(500, f"Facturama rechazo el timbrado: {e}")

    # Crear registro DocumentoVenta tipo FACTURA + flag factura_global
    folio_nuevo = _siguiente_folio_global(db, empresa_id)
    subtotal_total = sum(float(t.subtotal or 0) for t in tickets)
    iva_total = sum(float(t.iva or 0) for t in tickets)
    total_grand = sum(float(t.total or 0) for t in tickets)

    fg = DocumentoVenta(
        empresa_id=empresa_id,
        folio=folio_nuevo,
        tipo="FACTURA",
        estatus="CONFIRMADO",
        cliente_id=None,  # publico en general sin cliente registrado
        vendedor_id=usuario.id,
        fecha=datetime.utcnow(),
        subtotal=subtotal_total,
        iva=iva_total,
        total=total_grand,
        forma_pago_sat="01",
        metodo_pago_sat="PUE",
        moneda="MXN",
        uso_cfdi="S01",
        notas=f"Factura global {PERIODICIDAD_LABEL.get(payload.periodicidad, '')} "
              f"del {payload.fecha_inicio} al {payload.fecha_fin}. "
              f"{len(tickets)} tickets.",
        es_factura_global=True,
        periodo_global=f"{payload.periodicidad}-{payload.mes}-{payload.anio}",
        creado_en=datetime.utcnow(),
    )
    db.add(fg)
    db.flush()

    # Guardar CFDI
    cfdi = Cfdi(
        documento_venta_id=fg.id,
        uuid=resp.get("Complement", {}).get("TaxStamp", {}).get("Uuid", "")
             or resp.get("Id", ""),
        serie=resp.get("Serie", ""),
        folio=str(resp.get("Folio", "")),
        fecha_timbrado=datetime.utcnow(),
        rfc_emisor=empresa.rfc,
        rfc_receptor="XAXX010101000",
        total=total_grand,
        tipo_comprobante="I",
        xml_url=resp.get("Id", ""),  # id de Facturama para descargar
    )
    db.add(cfdi)

    # Marcar los tickets como incluidos en esta FG
    for t in tickets:
        t.factura_global_id = fg.id
    db.commit()
    db.refresh(fg)

    return {
        "ok": True,
        "factura_global_id": fg.id,
        "folio": fg.folio,
        "uuid": cfdi.uuid,
        "n_tickets_incluidos": len(tickets),
        "total": total_grand,
    }


def _siguiente_folio_global(db, empresa_id: int) -> str:
    """Genera folio nuevo tipo E{empresa_id}-FG-NNNNNN."""
    cnt = (
        db.query(DocumentoVenta)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .filter(DocumentoVenta.es_factura_global == True)
        .count()
    )
    return f"E{empresa_id}-FG-{cnt+1:06d}"


@router.get("/historial")
def listar_historial(
    limit: int = 50,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(DocumentoVenta)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .filter(DocumentoVenta.es_factura_global == True)
        .order_by(DocumentoVenta.fecha.desc())
        .limit(limit).all()
    )
    resultado = []
    for d in rows:
        n_tickets = (
            db.query(DocumentoVenta)
            .filter(DocumentoVenta.factura_global_id == d.id)
            .count()
        )
        cfdi = db.query(Cfdi).filter(Cfdi.documento_venta_id == d.id).first()
        resultado.append({
            "id": d.id, "folio": d.folio,
            "fecha": d.fecha.isoformat() if d.fecha else None,
            "total": float(d.total),
            "n_tickets": n_tickets,
            "periodo": d.periodo_global,
            "notas": d.notas,
            "uuid": cfdi.uuid if cfdi else None,
        })
    return resultado
