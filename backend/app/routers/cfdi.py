"""Endpoints CFDI 4.0 - operados con la empresa activa."""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import cfdi_service
from app.models import Cfdi, DocumentoVenta
from app.services.security import get_active_empresa_id

router = APIRouter()


@router.post("/timbrar/{documento_id}")
def timbrar_documento(
    documento_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    try:
        return cfdi_service.timbrar(db, documento_id, empresa_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/cancelar/{cfdi_id}")
def cancelar_cfdi(
    cfdi_id: int,
    motivo: str = Query(..., description="01|02|03|04"),
    uuid_sustituye: str | None = None,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    try:
        return cfdi_service.cancelar(db, cfdi_id, motivo, uuid_sustituye, empresa_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/{cfdi_id}/xml")
def descargar_xml(
    cfdi_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    try:
        xml_bytes = cfdi_service.descargar_xml(db, cfdi_id, empresa_id)
    except Exception as e:
        raise HTTPException(400, str(e))
    cfdi = db.get(Cfdi, cfdi_id)
    return Response(
        content=xml_bytes, media_type="application/xml",
        headers={"Content-Disposition": f"attachment; filename={cfdi.uuid}.xml"},
    )


@router.get("/{cfdi_id}/pdf")
def descargar_pdf(
    cfdi_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    try:
        pdf_bytes = cfdi_service.descargar_pdf_cfdi(db, cfdi_id, empresa_id)
    except Exception as e:
        raise HTTPException(400, str(e))
    cfdi = db.get(Cfdi, cfdi_id)
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={cfdi.uuid}.pdf"},
    )


@router.get("/documento/{documento_id}")
def cfdi_de_documento(
    documento_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    cfdi = (
        db.query(Cfdi)
        .join(DocumentoVenta, DocumentoVenta.id == Cfdi.documento_venta_id)
        .filter(Cfdi.documento_venta_id == documento_id)
        .filter(DocumentoVenta.empresa_id == empresa_id)
        .first()
    )
    if not cfdi:
        raise HTTPException(404, "Sin CFDI emitido")
    return {
        "cfdi_id": cfdi.id, "uuid": cfdi.uuid, "serie": cfdi.serie, "folio": cfdi.folio,
        "rfc_emisor": cfdi.rfc_emisor, "rfc_receptor": cfdi.rfc_receptor,
        "total": float(cfdi.total), "cancelado": cfdi.cancelado,
        "fecha_timbrado": cfdi.fecha_timbrado.isoformat(),
    }
