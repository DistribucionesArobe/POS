"""Logica de timbrado/cancelacion via Facturama, por empresa."""
from datetime import datetime
from sqlalchemy.orm import Session

from app.integrations.facturama import FacturamaClient, FacturamaError
from app.models import DocumentoVenta, Cfdi, Cliente, Empresa
from app.services import email_service


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

    # Envio automatico via SMTP propio (descarga XML+PDF de Facturama y los adjunta)
    if facturama_id and cliente.correo and email_service.smtp_configurado():
        try:
            xml_bytes = client.descargar_xml(facturama_id)
            pdf_bytes = client.descargar_pdf(facturama_id)
            ok, err = email_service.enviar_cfdi(
                destinatario=cliente.correo,
                nombre_destinatario=cliente.razon_social or cliente.nombre,
                uuid=cfdi.uuid,
                serie=cfdi.serie,
                folio=cfdi.folio,
                rfc_emisor=empresa.rfc,
                razon_social_emisor=empresa.razon_social or empresa.nombre,
                xml_bytes=xml_bytes,
                pdf_bytes=pdf_bytes,
            )
            if ok:
                cfdi.correo_enviado_a = cliente.correo
                cfdi.correo_enviado_en = datetime.utcnow()
                db.commit()
        except Exception:
            pass  # no rompemos el timbrado por fallo de mail

    return {
        "cfdi_id": cfdi.id, "uuid": cfdi.uuid, "serie": cfdi.serie, "folio": cfdi.folio,
        "rfc_emisor": cfdi.rfc_emisor, "rfc_receptor": cfdi.rfc_receptor,
        "total": float(cfdi.total),
        "correo_enviado_a": cfdi.correo_enviado_a,
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


def emitir_nota_credito_cfdi(db: Session, nc_id: int, empresa_id: int) -> dict:
    """Emite CFDI Egreso (tipo E) para una NOTA_CREDITO ya creada."""
    nc = db.get(DocumentoVenta, nc_id)
    if not nc or nc.empresa_id != empresa_id:
        raise ValueError("Nota de credito no existe o de otra empresa")
    if nc.tipo != "NOTA_CREDITO":
        raise ValueError("Documento no es nota de credito")
    if not nc.factura_relacionada_id:
        raise ValueError("NC sin factura relacionada")

    factura = db.get(DocumentoVenta, nc.factura_relacionada_id)
    cfdi_factura = db.query(Cfdi).filter(Cfdi.documento_venta_id == factura.id).first()
    if not cfdi_factura:
        raise ValueError("La factura relacionada no esta timbrada - no se puede emitir NC fiscal")

    cliente = db.get(Cliente, nc.cliente_id)
    empresa = db.get(Empresa, empresa_id)

    existente = db.query(Cfdi).filter(Cfdi.documento_venta_id == nc.id).first()
    if existente and not existente.cancelado:
        raise ValueError(f"NC ya timbrada (UUID {existente.uuid})")

    client = FacturamaClient(empresa)

    # Construir payload Egreso con CfdiRelacionados al UUID original
    items = []
    for c in nc.conceptos:
        importe = float(c.importe)
        tasa = float(c.tasa_iva)
        iva_calc = round(importe * tasa, 2)
        items.append({
            "ProductCode": c.clave_prod_serv_sat or "01010101",
            "IdentificationNumber": str(c.variante_id),
            "Description": c.descripcion,
            "Unit": "Pieza",
            "UnitCode": c.clave_unidad_sat or "H87",
            "UnitPrice": float(c.precio_unitario),
            "Quantity": float(c.cantidad),
            "Subtotal": importe,
            "TaxObject": "02",
            "Taxes": [{
                "Total": iva_calc, "Name": "IVA", "Base": importe,
                "Rate": tasa, "IsRetention": False,
            }],
            "Total": importe + iva_calc,
        })

    payload = {
        "NameId": "2",
        "CfdiType": "E",
        "PaymentForm": nc.forma_pago_sat,
        "PaymentMethod": "PUE",
        "Currency": "MXN",
        "ExpeditionPlace": empresa.codigo_postal,
        "Issuer": {
            "FiscalRegime": empresa.regimen_fiscal,
            "Rfc": empresa.rfc,
            "Name": (empresa.razon_social or empresa.nombre).upper(),
        },
        "Receiver": {
            "Rfc": cliente.rfc,
            "Name": (cliente.razon_social or cliente.nombre).upper(),
            "FiscalRegime": cliente.regimen_fiscal or "616",
            "TaxZipCode": cliente.codigo_postal or empresa.codigo_postal,
            "CfdiUse": "G02",
        },
        "Relations": {
            "Type": "01",  # 01 = Nota de credito de los documentos relacionados
            "Cfdis": [{"Uuid": cfdi_factura.uuid}],
        },
        "Items": items,
    }
    try:
        response = client._post("/3/cfdis", payload)
    except FacturamaError as e:
        raise ValueError(f"Facturama rechazo NC: {e}")

    uuid = response["Complement"]["TaxStamp"]["Uuid"]
    facturama_id = response.get("Id")
    fecha_str = response["Complement"]["TaxStamp"]["Date"].replace("Z", "")

    cfdi_nc = Cfdi(
        documento_venta_id=nc.id,
        uuid=uuid,
        serie=response.get("Serie", ""),
        folio=str(response.get("Folio", "")),
        fecha_timbrado=datetime.fromisoformat(fecha_str.split("+")[0]),
        rfc_emisor=response["Issuer"]["Rfc"],
        rfc_receptor=response["Receiver"]["Rfc"],
        total=nc.total,
        tipo_comprobante="E",
        respuesta_pac=response,
        xml_url=f"facturama://{facturama_id}/xml" if facturama_id else None,
        pdf_url=f"facturama://{facturama_id}/pdf" if facturama_id else None,
    )

    db.add(cfdi_nc)
    db.commit()

    if facturama_id and cliente.correo and email_service.smtp_configurado():
        try:
            xml_bytes = client.descargar_xml(facturama_id)
            pdf_bytes = client.descargar_pdf(facturama_id)
            ok, _ = email_service.enviar_cfdi(
                destinatario=cliente.correo,
                nombre_destinatario=cliente.razon_social or cliente.nombre,
                uuid=cfdi_nc.uuid, serie=cfdi_nc.serie, folio=cfdi_nc.folio,
                rfc_emisor=empresa.rfc,
                razon_social_emisor=empresa.razon_social or empresa.nombre,
                xml_bytes=xml_bytes, pdf_bytes=pdf_bytes,
            )
            if ok:
                cfdi_nc.correo_enviado_a = cliente.correo
                cfdi_nc.correo_enviado_en = datetime.utcnow()
                db.commit()
        except Exception:
            pass

    return {
        "cfdi_id": cfdi_nc.id, "uuid": uuid,
        "serie": cfdi_nc.serie, "folio": cfdi_nc.folio,
        "correo_enviado_a": cfdi_nc.correo_enviado_a,
    }


def reenviar_correo(db: Session, cfdi_id: int, email: str | None, empresa_id: int) -> dict:
    """Re-envia un CFDI ya timbrado al correo dado (o al del cliente) via SMTP propio."""
    cfdi = db.get(Cfdi, cfdi_id)
    if not cfdi:
        raise ValueError("CFDI no existe")
    doc = db.get(DocumentoVenta, cfdi.documento_venta_id)
    if not doc or doc.empresa_id != empresa_id:
        raise ValueError("CFDI de otra empresa")
    cliente = db.get(Cliente, doc.cliente_id)
    destino = email or (cliente.correo if cliente else None)
    if not destino:
        raise ValueError("No hay correo en el cliente y no se especifico uno")

    if not email_service.smtp_configurado():
        raise ValueError(
            "SMTP no configurado. Define SMTP_HOST, SMTP_USER y SMTP_PASSWORD en el backend."
        )

    empresa = db.get(Empresa, empresa_id)
    facturama_id = (cfdi.xml_url or "").replace("facturama://", "").split("/")[0]
    if not facturama_id:
        raise ValueError("CFDI sin id Facturama")

    client = FacturamaClient(empresa)
    try:
        xml_bytes = client.descargar_xml(facturama_id)
        pdf_bytes = client.descargar_pdf(facturama_id)
    except Exception as e:
        raise ValueError(f"No se pudo bajar XML/PDF de Facturama: {e}")

    ok, err = email_service.enviar_cfdi(
        destinatario=destino,
        nombre_destinatario=(cliente.razon_social if cliente else "") or (cliente.nombre if cliente else ""),
        uuid=cfdi.uuid, serie=cfdi.serie, folio=cfdi.folio,
        rfc_emisor=empresa.rfc,
        razon_social_emisor=empresa.razon_social or empresa.nombre,
        xml_bytes=xml_bytes, pdf_bytes=pdf_bytes,
    )
    if not ok:
        raise ValueError(f"SMTP rechazo el envio: {err}")

    cfdi.correo_enviado_a = destino
    cfdi.correo_enviado_en = datetime.utcnow()
    db.commit()
    return {"ok": True, "correo_enviado_a": destino}


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
