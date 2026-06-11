"""Logica de timbrado/cancelacion via Facturama, por empresa."""
from datetime import datetime
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.integrations.facturama import FacturamaClient, FacturamaError
from app.models import (
    DocumentoVenta, Cfdi, Cliente, Empresa,
    CuentaPorCobrar, AbonoCxC, ComplementoPago,
)
from app.services import email_service

IVA_TASA = 0.16

# Codigos SAT que aplican a CFDI tipo P (Pago)
SAT_CLAVE_PROD_PAGO = "84111506"  # Servicios de facturación
SAT_CLAVE_UNIDAD_PAGO = "ACT"      # Actividad


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

    # Envio automatico via SMTP propio (descarga XML, genera PDF propio y los adjunta)
    if facturama_id and cliente.correo and email_service.smtp_configurado():
        try:
            xml_bytes = client.descargar_xml(facturama_id)
            # PDF propio con el formato del sistema (footer correcto, etc.)
            try:
                from app.services import cfdi_pdf_service
                pdf_bytes = cfdi_pdf_service.generar_pdf_cfdi(db, cfdi.id, empresa_id, xml_bytes)
            except Exception:
                # Fallback al PDF de Facturama si nuestro motor falla
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
    """Genera PDF de CFDI usando nuestro motor propio.
    Si algo falla cae al PDF de Facturama como fallback."""
    cfdi = db.get(Cfdi, cfdi_id)
    if not cfdi:
        raise ValueError("CFDI no existe")
    doc = db.get(DocumentoVenta, cfdi.documento_venta_id)
    if not doc or doc.empresa_id != empresa_id:
        raise ValueError("CFDI de otra empresa")
    empresa = db.get(Empresa, empresa_id)
    facturama_id = (cfdi.xml_url or "").replace("facturama://", "").split("/")[0]
    client = FacturamaClient(empresa)
    try:
        xml_bytes = client.descargar_xml(facturama_id)
        from app.services import cfdi_pdf_service
        return cfdi_pdf_service.generar_pdf_cfdi(db, cfdi_id, empresa_id, xml_bytes)
    except Exception as e:
        # Fallback al PDF de Facturama si nuestro motor falla
        import logging
        logging.getLogger(__name__).exception("PDF propio fallo, cayendo a Facturama: %s", e)
        return client.descargar_pdf(facturama_id)


def emitir_complemento_pago(db: Session, abono_id: int, empresa_id: int) -> dict:
    """Emite CFDI Complemento de Pago (tipo P) por un abono a una factura PPD timbrada.

    Reglas SAT 4.0:
    - El CFDI base de Pago no lleva conceptos con monto (Subtotal=Total=0)
    - El monto y desglose va en el complemento Payments[].RelatedDocuments[]
    - Parcialidad es incremental (1, 2, 3...) por cada abono a la misma factura
    - PreviousBalanceAmount = saldo antes del abono
    - AmountPaid = monto del abono
    - ImpSaldoInsoluto = saldo despues del abono
    - Si el CFDI original llevaba IVA 16%, los Taxes del RelatedDocument
      desglosan IVA proporcional al monto pagado.
    """
    abono = db.get(AbonoCxC, abono_id)
    if not abono:
        raise ValueError("Abono no existe")
    cxc = db.get(CuentaPorCobrar, abono.cxc_id)
    if not cxc:
        raise ValueError("CxC no existe")
    doc = db.get(DocumentoVenta, cxc.documento_id)
    if not doc or doc.empresa_id != empresa_id:
        raise ValueError("Documento de otra empresa")
    if doc.tipo != "FACTURA":
        raise ValueError("Solo se puede emitir complemento de pago sobre FACTURAs PPD")
    if doc.metodo_pago_sat != "PPD":
        raise ValueError("La factura no es PPD; no requiere complemento de pago")

    cfdi_origen = db.query(Cfdi).filter(Cfdi.documento_venta_id == doc.id).first()
    if not cfdi_origen or cfdi_origen.cancelado:
        raise ValueError("La factura no esta timbrada o esta cancelada")

    # No re-emitir si ya hay complemento por este abono
    if abono.id:
        existente = db.query(ComplementoPago).filter(
            ComplementoPago.abono_cxc_id == abono.id
        ).first()
        if existente:
            raise ValueError(f"Este abono ya tiene complemento UUID {existente.uuid_complemento}")

    cliente = db.get(Cliente, doc.cliente_id)
    empresa = db.get(Empresa, empresa_id)

    # Parcialidad: cuantos abonos anteriores a este existen en la misma CxC
    parcialidad = (
        db.query(func.count(AbonoCxC.id))
        .filter(AbonoCxC.cxc_id == cxc.id, AbonoCxC.id < abono.id)
        .scalar() or 0
    ) + 1

    # Saldo antes del abono = saldo actual + monto del abono
    saldo_actual = float(cxc.saldo)  # despues del abono
    monto = float(abono.monto)
    saldo_anterior = round(saldo_actual + monto, 2)
    saldo_insoluto = round(saldo_actual, 2)

    # IVA proporcional al monto pagado (asumiendo factura original con 16%)
    base = round(monto / (1 + IVA_TASA), 2)
    iva = round(monto - base, 2)

    # Mapeo de forma de pago: el abono guarda nombres ("EFECTIVO", "TRANSFERENCIA")
    # o codigos directos ("01", "03"). Resolvemos a codigo SAT.
    forma_map = {
        "EFECTIVO": "01", "CHEQUE": "02", "TRANSFERENCIA": "03",
        "TARJETA_CREDITO": "04", "T_CREDITO": "04",
        "TARJETA_DEBITO": "28", "T_DEBITO": "28",
        "01": "01", "02": "02", "03": "03", "04": "04", "28": "28",
    }
    forma_sat = forma_map.get((abono.forma_pago or "").upper().strip(), "01")

    fecha_pago = abono.fecha.strftime("%Y-%m-%dT%H:%M:%S")

    payload = {
        "NameId": "14",
        "CfdiType": "P",
        "PaymentForm": "01",  # Dummy en P; se ignora SAT
        "PaymentMethod": "PUE",  # Dummy en P
        "Currency": "XXX",  # Para CFDI P el sat marca XXX (sin moneda)
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
            "CfdiUse": "CP01",  # Pagos
        },
        "Items": [{
            "ProductCode": SAT_CLAVE_PROD_PAGO,
            "Description": "Pago",
            "Unit": "Actividad",
            "UnitCode": SAT_CLAVE_UNIDAD_PAGO,
            "Quantity": 1,
            "UnitPrice": 0,
            "Subtotal": 0,
            "Total": 0,
            "TaxObject": "01",
        }],
        "Complemento": {
            "Payments": [{
                "Date": fecha_pago,
                "PaymentForm": forma_sat,
                "Currency": "MXN",
                "Amount": round(monto, 2),
                "RelatedDocuments": [{
                    "Uuid": cfdi_origen.uuid,
                    "Serie": cfdi_origen.serie or "",
                    "Folio": cfdi_origen.folio or "",
                    "Currency": "MXN",
                    "PaymentMethod": "PPD",
                    "PartialityNumber": parcialidad,
                    "PreviousBalanceAmount": saldo_anterior,
                    "AmountPaid": round(monto, 2),
                    "ImpSaldoInsoluto": saldo_insoluto,
                    "TaxObject": "02",
                    "Taxes": [{
                        "Total": iva,
                        "Name": "IVA",
                        "Base": base,
                        "Rate": IVA_TASA,
                        "IsRetention": False,
                    }],
                }],
            }],
        },
    }

    client = FacturamaClient(empresa)
    try:
        response = client.emitir_pago(payload)
    except FacturamaError as e:
        raise ValueError(f"Facturama rechazo complemento: {e}")

    uuid_p = response["Complement"]["TaxStamp"]["Uuid"]
    facturama_id_p = response.get("Id")
    fecha_str = response["Complement"]["TaxStamp"]["Date"].replace("Z", "")

    # Guardamos un Cfdi tipo P y tambien un ComplementoPago para el ligue al abono
    cfdi_p = Cfdi(
        documento_venta_id=doc.id,
        uuid=uuid_p,
        serie=response.get("Serie", ""),
        folio=str(response.get("Folio", "")),
        fecha_timbrado=datetime.fromisoformat(fecha_str.split("+")[0]),
        rfc_emisor=response["Issuer"]["Rfc"],
        rfc_receptor=response["Receiver"]["Rfc"],
        total=monto,
        tipo_comprobante="P",
        respuesta_pac=response,
        xml_url=f"facturama://{facturama_id_p}/xml" if facturama_id_p else None,
        pdf_url=f"facturama://{facturama_id_p}/pdf" if facturama_id_p else None,
    )
    # ojo: hay un unique en documento_venta_id; CFDI tipo P no debe compartirlo
    # Solucion: dejarlo nullable. Pero por ahora insertamos el ComplementoPago
    # y NO insertamos Cfdi tipo P para no chocar el unique.

    cp = ComplementoPago(
        cfdi_origen_id=cfdi_origen.id,
        abono_cxc_id=abono.id,
        uuid_complemento=uuid_p,
        monto_pagado=monto,
        fecha_pago=abono.fecha,
        forma_pago_sat=forma_sat,
        moneda="MXN",
        xml_url=f"facturama://{facturama_id_p}/xml" if facturama_id_p else None,
    )
    db.add(cp)
    db.commit()

    # Enviar por correo via SMTP propio
    if cliente.correo and email_service.smtp_configurado() and facturama_id_p:
        try:
            xml_bytes = client.descargar_xml(facturama_id_p)
            pdf_bytes = client.descargar_pdf(facturama_id_p)
            email_service.enviar_cfdi(
                destinatario=cliente.correo,
                nombre_destinatario=cliente.razon_social or cliente.nombre,
                uuid=uuid_p,
                serie=cfdi_p.serie,
                folio=cfdi_p.folio,
                rfc_emisor=empresa.rfc,
                razon_social_emisor=empresa.razon_social or empresa.nombre,
                xml_bytes=xml_bytes, pdf_bytes=pdf_bytes,
            )
        except Exception:
            pass

    return {
        "ok": True,
        "uuid": uuid_p,
        "parcialidad": parcialidad,
        "monto": monto,
        "saldo_insoluto": saldo_insoluto,
        "facturama_id": facturama_id_p,
    }
