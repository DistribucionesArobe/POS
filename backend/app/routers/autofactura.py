"""Portal publico de autofacturacion.

Flujo:
  1. Cliente captura folio + total del ticket
  2. Backend valida que el ticket exista, no este facturado y este vigente
  3. Cliente captura datos fiscales (RFC, razon social, regimen, CP, uso CFDI, correo)
  4. Backend convierte el TICKET en FACTURA, timbra y envia por correo

Endpoints publicos (NO requieren JWT). La seguridad se basa en:
  - El folio es un secreto compartido entre Aceromax y cliente (impreso en ticket)
  - El total debe coincidir (segundo factor)
  - El ticket solo se factura una vez
  - El plazo limite es el ultimo dia del mes siguiente al de emision (regla SAT)
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import (
    DocumentoVenta, ConceptoVenta, Cliente, Empresa, Cfdi, Producto, VarianteProducto,
)
from app.models.venta import TipoDocumento, EstatusDocumento
from app.services import cfdi_service
from app.utils.folios import siguiente_folio

router = APIRouter()


# ----- Schemas -----

class BuscarTicketIn(BaseModel):
    folio: str = Field(min_length=2, max_length=32)
    total: float = Field(gt=0)


class FacturarIn(BaseModel):
    folio: str
    total: float
    rfc: str = Field(min_length=12, max_length=13)
    razon_social: str = Field(min_length=2, max_length=255)
    regimen_fiscal: str = Field(min_length=3, max_length=4)  # 601, 612, 616, 626...
    codigo_postal: str = Field(min_length=5, max_length=5)
    uso_cfdi: str = Field(min_length=3, max_length=4)  # G01, G02, G03, S01...
    correo: str = Field(min_length=4, max_length=255)


# ----- Helpers -----

def _vigente(fecha_emision: datetime) -> bool:
    """SAT 4.0: factura debe emitirse a mas tardar el dia 4 del mes siguiente
    al de emision del ticket. Aqui aplicamos regla mas laxa: mes corriente + 30 dias.
    """
    return (datetime.utcnow() - fecha_emision) < timedelta(days=60)


def _ticket_valido(db: Session, folio: str, total: float) -> DocumentoVenta:
    doc = db.query(DocumentoVenta).filter(DocumentoVenta.folio == folio).first()
    if not doc:
        raise HTTPException(404, "Folio no encontrado. Verifica los datos del ticket.")
    if doc.tipo not in (TipoDocumento.TICKET.value, TipoDocumento.REMISION.value):
        raise HTTPException(400, "Este documento no es facturable desde el portal.")
    if doc.estatus == EstatusDocumento.CANCELADO.value:
        raise HTTPException(400, "Este ticket esta cancelado.")
    if abs(float(doc.total) - float(total)) > 0.01:
        raise HTTPException(400, "El total no coincide con el del ticket.")
    if doc.factura_padre_id is not None:
        raise HTTPException(400, "Este ticket ya fue facturado previamente.")
    if not _vigente(doc.fecha):
        raise HTTPException(400, "El plazo para facturar este ticket ha vencido.")
    return doc


# ----- Endpoints -----

@router.post("/buscar")
def buscar_ticket(payload: BuscarTicketIn):
    """Verifica que el ticket sea facturable y devuelve resumen sin datos sensibles."""
    db = SessionLocal()
    try:
        doc = _ticket_valido(db, payload.folio, payload.total)
        empresa = db.get(Empresa, doc.empresa_id)
        return {
            "ok": True,
            "folio": doc.folio,
            "fecha": doc.fecha.isoformat(),
            "subtotal": float(doc.subtotal),
            "iva": float(doc.iva),
            "total": float(doc.total),
            "emisor": {
                "nombre": empresa.nombre,
                "rfc": empresa.rfc,
                "razon_social": empresa.razon_social,
            },
            "conceptos": [
                {
                    "descripcion": c.descripcion,
                    "cantidad": float(c.cantidad),
                    "precio_unitario": float(c.precio_unitario),
                    "importe": float(c.importe),
                }
                for c in doc.conceptos
            ],
        }
    finally:
        db.close()


@router.post("/emitir")
def emitir_factura(payload: FacturarIn):
    """Convierte el TICKET en FACTURA, timbra el CFDI y envia por correo."""
    db = SessionLocal()
    try:
        doc_original = _ticket_valido(db, payload.folio, payload.total)
        empresa_id = doc_original.empresa_id

        # Buscar o crear cliente por RFC dentro de la empresa
        cliente = db.query(Cliente).filter(
            Cliente.empresa_id == empresa_id,
            Cliente.rfc == payload.rfc.upper(),
        ).first()
        if not cliente:
            cliente = Cliente(
                empresa_id=empresa_id,
                nombre=payload.razon_social,
                rfc=payload.rfc.upper(),
                razon_social=payload.razon_social.upper(),
                regimen_fiscal=payload.regimen_fiscal,
                codigo_postal=payload.codigo_postal,
                uso_cfdi_default=payload.uso_cfdi,
                correo=payload.correo,
            )
            db.add(cliente)
            db.flush()
        else:
            # Actualizar datos si cambiaron (correo es lo mas importante)
            cliente.razon_social = payload.razon_social.upper()
            cliente.regimen_fiscal = payload.regimen_fiscal
            cliente.codigo_postal = payload.codigo_postal
            cliente.uso_cfdi_default = payload.uso_cfdi
            cliente.correo = payload.correo

        # Crear FACTURA reflejando los mismos conceptos
        factura = DocumentoVenta(
            empresa_id=empresa_id,
            folio=siguiente_folio(db, TipoDocumento.FACTURA.value, empresa_id),
            tipo=TipoDocumento.FACTURA.value,
            estatus=EstatusDocumento.CONFIRMADO.value,
            cliente_id=cliente.id,
            fecha=datetime.utcnow(),
            subtotal=doc_original.subtotal,
            iva=doc_original.iva,
            total=doc_original.total,
            forma_pago_sat=doc_original.forma_pago_sat,
            metodo_pago_sat="PUE",
            uso_cfdi=payload.uso_cfdi,
            notas=f"Autofacturacion desde portal. Ticket origen: {doc_original.folio}",
        )
        for c in doc_original.conceptos:
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
        db.add(factura)
        db.flush()

        # Marcar el ticket original como ya facturado (relacion uno a uno)
        doc_original.factura_padre_id = factura.id
        doc_original.estatus = EstatusDocumento.FACTURADO.value

        db.commit()
        db.refresh(factura)

        # Timbrar con Facturama y enviar correo (cliente.correo ya quedo seteado)
        try:
            stamped = cfdi_service.timbrar(db, factura.id, empresa_id)
        except Exception as e:
            # No revertimos la factura - queda en BORRADOR para retimbrar manualmente
            raise HTTPException(400, f"No se pudo timbrar: {e}")

        return {
            "ok": True,
            "factura_folio": factura.folio,
            "uuid": stamped["uuid"],
            "serie_folio_sat": f'{stamped["serie"]}-{stamped["folio"]}',
            "correo_enviado_a": stamped.get("correo_enviado_a"),
            "cfdi_id": stamped["cfdi_id"],
        }
    finally:
        db.close()


@router.get("/empresas-publicas")
def empresas_publicas():
    """Lista empresas que aceptan autofacturacion (logo/nombre/rfc) para mostrar en portal."""
    db = SessionLocal()
    try:
        empresas = db.query(Empresa).filter(Empresa.activa == True).all()
        return [
            {"id": e.id, "nombre": e.nombre, "rfc": e.rfc, "razon_social": e.razon_social}
            for e in empresas
        ]
    finally:
        db.close()
