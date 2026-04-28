"""Logica de timbrado/cancelacion via Facturama (stub)."""
from datetime import datetime
from sqlalchemy.orm import Session

from app.integrations.facturama import FacturamaClient
from app.models import DocumentoVenta, Cfdi, Cliente


def timbrar(db: Session, documento_id: int) -> Cfdi:
    doc = db.get(DocumentoVenta, documento_id)
    if not doc:
        raise ValueError("Documento no existe")
    cliente = db.get(Cliente, doc.cliente_id)

    client = FacturamaClient()
    response = client.emitir_ingreso(documento=doc, cliente=cliente)

    cfdi = Cfdi(
        documento_venta_id=doc.id,
        uuid=response["Complement"]["TaxStamp"]["Uuid"],
        serie=response.get("Serie", ""),
        folio=str(response.get("Folio", "")),
        fecha_timbrado=datetime.fromisoformat(response["Complement"]["TaxStamp"]["Date"]),
        rfc_emisor=response["Issuer"]["Rfc"],
        rfc_receptor=response["Receiver"]["Rfc"],
        total=doc.total,
        tipo_comprobante="I",
        respuesta_pac=response,
    )
    db.add(cfdi)
    db.commit()
    return cfdi


def cancelar(db: Session, cfdi_id: int, motivo: str, uuid_sustituye: str | None = None):
    cfdi = db.get(Cfdi, cfdi_id)
    if not cfdi:
        raise ValueError("CFDI no existe")
    client = FacturamaClient()
    res = client.cancelar(cfdi.uuid, motivo, uuid_sustituye)
    cfdi.cancelado = True
    cfdi.motivo_cancelacion = motivo
    cfdi.uuid_sustituye = uuid_sustituye
    cfdi.fecha_cancelacion = datetime.utcnow()
    db.commit()
    return res


def emitir_nota_credito(db: Session, factura_id: int, motivo: str, conceptos: list[dict]):
    """TODO: emitir CFDI Egreso relacionado, devolver inventario, ajustar CxC."""
    raise NotImplementedError("Implementar en Fase 2")


def emitir_complemento_pago(db: Session, abono_cxc_id: int):
    """TODO: emitir CFDI tipo P relacionado a la factura PPD."""
    raise NotImplementedError("Implementar en Fase 2")
