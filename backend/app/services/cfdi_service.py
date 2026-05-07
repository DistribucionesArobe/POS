"""Logica de timbrado/cancelacion via Facturama, por empresa."""
from datetime import datetime
from sqlalchemy.orm import Session

from app.integrations.facturama import FacturamaClient, FacturamaError
from app.models import DocumentoVenta, Cfdi, Cliente, Empresa


def timbrar(db: Session, documento_id: int, empresa_id: int) -> dict:
    doc = db.get(DocumentoVenta, documento_id)
    if not doc:
        raise ValueError("Documento no existe")
    if doc.empresa_id != empresa_id:
        raise ValueError("El documento es de otra empresa")
    if doc.tipo != "FACTURA":
        raise ValueError("Solo se timbran documentos tipo FACTURA")

    cliente = db.get(Cliente, doc.cliente_id)
    if not cliente or not cliente.rfc:
        raise ValueError("Cliente sin RFC - no se puede timbrar")

    empresa = db.get(Empresa, empresa_id)
    if not empresa:
        raise ValueError("Empresa no existe")

    existente = db.query(Cfdi).filter(Cfdi.documento_venta_id == doc.id).first()
    if existente and not existente.cancelado:
        raise ValueError(f"Documento ya timbrado (UUID {existente.uuid})")

    client = FacturamaClient(empresa)
    try:
        response = client.emitir_ingreso(documento=doc, cliente=cliente)
    except FacturamaError as e:
        raise ValueError(f"Facturama rechazo el timbrado: {e}")

    uuid = response["Complement"]["TaxStamp"]["Uuid"]
    facturama_id = response.get("Id")
    fecha_str = response["Complement"]["TaxStamp"]["Date"].replace("Z", "")

    cfdi = Cfdi(
        documento_venta_id=doc.id,
        uuid=uuid,
        serie=response.get("Serie", ""),
        folio=str(response.get("Folio", "")),
        fecha_timbrado=datetime.fromisoformat(fecha_str.split("+")[0]),
        rfc_emisor=response["Issuer"]["Rfc"],
        rfc_receptor=response["Receiver"]["Rfc"],
        total=doc.total,
        tipo_comprobante="I",
        respuesta_pac=response,
        xml_url=f"facturama://{facturama_id}/xml" if facturama_id else None,
        pdf_url=f"facturama://{facturama_id}/pdf" if facturama_id else None,
    )
    db.add(cfdi)
    db.commit()
    db.refresh(cfdi)
    return {
        "cfdi_id": cfdi.id, "uuid": cfdi.uuid, "serie": cfdi.serie, "folio": cfdi.folio,
        "rfc_emisor": cfdi.rfc_emisor, "rfc_receptor": cfdi.rfc_receptor,
        "total": float(cfdi.total),
    }


def cancelar(db: Session, cfdi_id: int, motivo: str, uuid_sustituye: str | None, empresa_id: int):
    cfdi = db.get(Cfdi, cfdi_id)
    if not cfdi:
        raise ValueError("CFDI no existe")
    doc = db.get(DocumentoVenta, cfdi.documento_venta_id)
    if not doc or doc.empresa_id != empresa_id:
        raise ValueError("CFDI de otra empresa")
    empresa = db.get(Empresa, empresa_id)

    facturama_id = (cfdi.xml_url or "").replace("facturama://", "").split("/")[0]
    if not facturama_id:
        raise ValueError("No se conoce el ID Facturama del CFDI")
    try:
        FacturamaClient(empresa).cancelar(facturama_id, motivo, uuid_sustituye)
    except FacturamaError as e:
        raise ValueError(f"Facturama rechazo cancelacion: {e}")
    cfdi.cancelado = True
    cfdi.motivo_cancelacion = motivo
    cfdi.uuid_sustituye = uuid_sustituye
    cfdi.fecha_cancelacion = datetime.utcnow()
    db.commit()
    return {"ok": True, "uuid": cfdi.uuid, "motivo": motivo}


def descargar_xml(db: Session, cfdi_id: int, empresa_id: int) -> bytes:
    cfdi = db.get(Cfdi, cfdi_id)
    if not cfdi:
        raise ValueError("CFDI no existe")
    doc = db.get(DocumentoVenta, cfdi.documento_venta_id)
    if not doc or doc.empresa_id != empresa_id:
        raise ValueError("CFDI de otra empresa")
    empresa = db.get(Empresa, empresa_id)
    facturama_id = (cfdi.xml_url or "").replace("facturama://", "").split("/")[0]
    return FacturamaClient(empresa).descargar_xml(facturama_id)


def descargar_pdf_cfdi(db: Session, cfdi_id: int, empresa_id: int) -> bytes:
    cfdi = db.get(Cfdi, cfdi_id)
    if not cfdi:
        raise ValueError("CFDI no existe")
    doc = db.get(DocumentoVenta, cfdi.documento_venta_id)
    if not doc or doc.empresa_id != empresa_id:
        raise ValueError("CFDI de otra empresa")
    empresa = db.get(Empresa, empresa_id)
    facturama_id = (cfdi.xml_url or "").replace("facturama://", "").split("/")[0]
    return FacturamaClient(empresa).descargar_pdf(facturama_id)
