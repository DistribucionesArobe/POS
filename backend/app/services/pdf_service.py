"""Generador de PDFs para tickets y remisiones - usa nombre de empresa."""
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT

from app.models import DocumentoVenta, Cliente, Empresa


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
    elements.append(Spacer(1, 24))

    if doc.tipo == "REMISION":
        aviso_style = ParagraphStyle('av', parent=styles['Normal'], fontSize=9,
                                     alignment=TA_CENTER, textColor=colors.HexColor('#dc2626'))
        elements.append(Paragraph(
            "<i>Este documento NO es factura. Para facturar contacte al emisor.</i>",
            aviso_style,
        ))

    pdf.build(elements)
    pdf_bytes = buf.getvalue()
    buf.close()
    return pdf_bytes
