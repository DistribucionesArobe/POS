"""Generador de PDFs para tickets y remisiones - usa nombre de empresa."""
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT

from app.models import DocumentoVenta, Cliente, Empresa, Cotizacion


def generar_pdf_documento(doc: DocumentoVenta, cliente: Cliente, empresa: Empresa | None = None) -> bytes:
    buf = BytesIO()
    pdf = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=2*cm, rightMargin=2*cm, topMargin=1.5*cm, bottomMargin=1.5*cm,
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle('t', parent=styles['Heading1'], fontSize=18, alignment=TA_CENTER, spaceAfter=6)
    subt = ParagraphStyle('s', parent=styles['Heading2'], fontSize=14, alignment=TA_CENTER, spaceAfter=4)
    sub2 = ParagraphStyle('s2', parent=styles['Normal'], fontSize=10, alignment=TA_CENTER, spaceAfter=8, textColor=colors.HexColor('#6b7280'))
    norm = ParagraphStyle('n', parent=styles['Normal'], fontSize=10, alignment=TA_LEFT)

    nombre_emisor = (empresa.nombre if empresa else "EMISOR").upper()
    rfc_emisor = empresa.rfc if empresa else ""

    elements = [
        Paragraph(f"<b>{nombre_emisor}</b>", title),
        Paragraph(f"RFC {rfc_emisor}", sub2) if rfc_emisor else Spacer(1, 4),
        Paragraph(f"{doc.tipo} {doc.folio}", subt),
        Spacer(1, 12),
    ]

    info = [
        [Paragraph(f"<b>Cliente:</b> {cliente.nombre}", norm),
         Paragraph(f"<b>Fecha:</b> {doc.fecha.strftime('%d/%m/%Y %H:%M')}", norm)],
        [Paragraph(f"<b>RFC:</b> {cliente.rfc or 'XAXX010101000'}", norm),
         Paragraph(f"<b>Folio:</b> {doc.folio}", norm)],
    ]
    elements.append(Table(info, colWidths=[10*cm, 6*cm]))
    elements.append(Spacer(1, 18))

    data = [["Cant", "Descripcion", "P. Unit", "Importe"]]
    for c in doc.conceptos:
        data.append([
            f"{float(c.cantidad):.2f}",
            c.descripcion,
            f"${float(c.precio_unitario):,.2f}",
            f"${float(c.importe):,.2f}",
        ])
    t = Table(data, colWidths=[2*cm, 9*cm, 2.5*cm, 2.5*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1f2937')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 10),
        ('ALIGN', (0,0), (0,-1), 'CENTER'),
        ('ALIGN', (2,0), (-1,-1), 'RIGHT'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f9fafb')]),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('TOPPADDING', (0,0), (-1,-1), 6),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 12))

    totales = [
        ["Subtotal:", f"${float(doc.subtotal):,.2f}"],
        ["IVA 16%:", f"${float(doc.iva):,.2f}"],
        ["TOTAL:", f"${float(doc.total):,.2f}"],
    ]
    tt = Table(totales, colWidths=[3*cm, 3*cm], hAlign='RIGHT')
    tt.setStyle(TableStyle([
        ('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold'),
        ('FONTSIZE', (0,-1), (-1,-1), 12),
        ('ALIGN', (0,0), (-1,-1), 'RIGHT'),
        ('LINEABOVE', (0,-1), (-1,-1), 1, colors.black),
        ('TOPPADDING', (0,-1), (-1,-1), 8),
    ]))
    elements.append(tt)
    elements.append(Spacer(1, 12))

    # Forma(s) de pago si las hay
    pagos = getattr(doc, "pagos", None) or []
    if pagos:
        forma_label = {
            "01": "Efectivo", "02": "Cheque", "03": "Transferencia",
            "04": "T. Crédito", "28": "T. Débito", "99": "Por definir",
        }
        rows = [[forma_label.get(p.forma_pago_sat, p.forma_pago_sat), f"${float(p.monto):,.2f}"]
                for p in pagos]
        if len(rows) > 1 or (len(rows) == 1 and rows[0][0] != "Efectivo"):
            pago_t = Table([["Forma de pago", "Monto"]] + rows, colWidths=[6*cm, 3*cm], hAlign='RIGHT')
            pago_t.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#e5e7eb')),
                ('FONTSIZE', (0,0), (-1,-1), 9),
                ('ALIGN', (1,0), (1,-1), 'RIGHT'),
                ('GRID', (0,0), (-1,-1), 0.25, colors.grey),
                ('TOPPADDING', (0,0), (-1,-1), 3),
                ('BOTTOMPADDING', (0,0), (-1,-1), 3),
            ]))
            elements.append(pago_t)
            elements.append(Spacer(1, 12))

    elements.append(Spacer(1, 12))

    if doc.tipo == "REMISION":
        aviso_style = ParagraphStyle('av', parent=styles['Normal'], fontSize=9,
                                     alignment=TA_CENTER, textColor=colors.HexColor('#dc2626'))
        elements.append(Paragraph(
            "<i>Este documento NO es factura. Para facturar contacte al emisor.</i>",
            aviso_style,
        ))

    if doc.tipo == "TICKET":
        import os
        portal_base = os.environ.get("PORTAL_FACTURACION_URL", "")
        if portal_base:
            facturar_style = ParagraphStyle('fac', parent=styles['Normal'], fontSize=9,
                                            alignment=TA_CENTER, textColor=colors.HexColor('#2563eb'))
            elements.append(Paragraph(
                f"<b>¿Necesitas factura?</b> Captura tu RFC en: {portal_base}/facturar<br/>"
                f"Folio: <b>{doc.folio}</b> · Total: <b>${float(doc.total):,.2f}</b>",
                facturar_style,
            ))

    pdf.build(elements)
    pdf_bytes = buf.getvalue()
    buf.close()
    return pdf_bytes


def generar_pdf_cotizacion(cot: Cotizacion, cliente: Cliente | None, empresa: Empresa | None = None) -> bytes:
    buf = BytesIO()
    pdf = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=2*cm, rightMargin=2*cm, topMargin=1.5*cm, bottomMargin=1.5*cm,
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle('t', parent=styles['Heading1'], fontSize=18, alignment=TA_CENTER, spaceAfter=6)
    subt = ParagraphStyle('s', parent=styles['Heading2'], fontSize=14, alignment=TA_CENTER, spaceAfter=4)
    sub2 = ParagraphStyle('s2', parent=styles['Normal'], fontSize=10, alignment=TA_CENTER, spaceAfter=8, textColor=colors.HexColor('#6b7280'))
    norm = ParagraphStyle('n', parent=styles['Normal'], fontSize=10, alignment=TA_LEFT)

    nombre_emisor = (empresa.nombre if empresa else "EMISOR").upper()
    rfc_emisor = empresa.rfc if empresa else ""

    nombre_cliente = (cliente.nombre if cliente else (cot.nombre_libre or "Cliente"))
    vigencia_str = cot.vigencia_hasta.strftime("%d/%m/%Y") if cot.vigencia_hasta else "—"

    elements = [
        Paragraph(f"<b>{nombre_emisor}</b>", title),
        Paragraph(f"RFC {rfc_emisor}", sub2) if rfc_emisor else Spacer(1, 4),
        Paragraph(f"COTIZACION {cot.folio}", subt),
        Spacer(1, 10),
    ]

    info = [
        [Paragraph(f"<b>Cliente:</b> {nombre_cliente}", norm),
         Paragraph(f"<b>Fecha:</b> {cot.fecha.strftime('%d/%m/%Y')}", norm)],
        [Paragraph(f"<b>WhatsApp:</b> {(cliente.whatsapp if cliente else cot.whatsapp_origen) or '—'}", norm),
         Paragraph(f"<b>Vigencia:</b> hasta {vigencia_str}", norm)],
    ]
    elements.append(Table(info, colWidths=[10*cm, 6*cm]))
    elements.append(Spacer(1, 16))

    data = [["Cant", "Descripcion", "Unidad", "P. Unit", "Importe"]]
    for c in (cot.conceptos or []):
        data.append([
            f"{float(c['cantidad']):.2f}",
            c.get('descripcion', ''),
            c.get('unidad', ''),
            f"${float(c['precio_unitario']):,.2f}",
            f"${float(c['importe']):,.2f}",
        ])
    t = Table(data, colWidths=[1.6*cm, 8.2*cm, 1.4*cm, 2.4*cm, 2.4*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1f2937')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 10),
        ('ALIGN', (0,0), (0,-1), 'CENTER'),
        ('ALIGN', (2,0), (-1,-1), 'RIGHT'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f9fafb')]),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('TOPPADDING', (0,0), (-1,-1), 6),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 12))

    totales = [
        ["Subtotal:", f"${float(cot.subtotal):,.2f}"],
        ["IVA 16%:", f"${float(cot.iva):,.2f}"],
        ["TOTAL:", f"${float(cot.total):,.2f}"],
    ]
    tt = Table(totales, colWidths=[3*cm, 3*cm], hAlign='RIGHT')
    tt.setStyle(TableStyle([
        ('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold'),
        ('FONTSIZE', (0,-1), (-1,-1), 12),
        ('ALIGN', (0,0), (-1,-1), 'RIGHT'),
        ('LINEABOVE', (0,-1), (-1,-1), 1, colors.black),
        ('TOPPADDING', (0,-1), (-1,-1), 8),
    ]))
    elements.append(tt)
    elements.append(Spacer(1, 18))

    aviso_style = ParagraphStyle('av', parent=styles['Normal'], fontSize=9,
                                  alignment=TA_CENTER, textColor=colors.HexColor('#6b7280'))
    elements.append(Paragraph(
        "<i>Esta cotización NO es factura. Precios sujetos a confirmación al momento de la compra. "
        f"Vigente hasta {vigencia_str}.</i>",
        aviso_style,
    ))
    if cot.notas:
        elements.append(Spacer(1, 8))
        elements.append(Paragraph(f"<b>Notas:</b> {cot.notas}", norm))

    pdf.build(elements)
    pdf_bytes = buf.getvalue()
    buf.close()
    return pdf_bytes
