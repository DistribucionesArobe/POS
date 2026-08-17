"""Generacion de PDF profesional del CFDI 4.0 timbrado.

Toma los datos del CFDI guardado en BD + el XML que descarga Facturama
y arma un PDF con:
- Header con razon social, RFC, regimen del emisor + logo
- Box de receptor con sus datos fiscales
- Box de datos CFDI (folio fiscal, fecha timbrado, uso CFDI, etc.)
- Tabla de conceptos paginada (sin overlap con footer)
- Totales con desglose de impuestos y retenciones
- Cadena original SAT, sello CFD y sello SAT
- QR oficial SAT
- Footer "Representacion impresa de un CFDI" en cada pagina
"""
from __future__ import annotations

import io
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from decimal import Decimal

import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer,
    Table, TableStyle, Image, KeepTogether,
)
from sqlalchemy.orm import Session

from app.models import Cfdi, DocumentoVenta, ConceptoVenta, Empresa, Cliente, Pago
from app.integrations.facturama import FacturamaClient


# ===== Namespaces XML CFDI 4.0 =====
NS = {
    "cfdi": "http://www.sat.gob.mx/cfd/4",
    "tfd": "http://www.sat.gob.mx/TimbreFiscalDigital",
}


# ===== Estilos =====
def _estilos():
    base = getSampleStyleSheet()
    return {
        "titulo": ParagraphStyle(
            "titulo", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=13, textColor=colors.HexColor("#0f172a"),
            leading=15,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=10, textColor=colors.HexColor("#475569"),
            leading=12, spaceAfter=2,
        ),
        "label": ParagraphStyle(
            "label", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=7, textColor=colors.HexColor("#64748b"),
            leading=9,
        ),
        "normal": ParagraphStyle(
            "normal", parent=base["Normal"],
            fontName="Helvetica", fontSize=9, textColor=colors.HexColor("#0f172a"),
            leading=11,
        ),
        "small": ParagraphStyle(
            "small", parent=base["Normal"],
            fontName="Helvetica", fontSize=7, textColor=colors.HexColor("#475569"),
            leading=9,
        ),
        "tiny": ParagraphStyle(
            "tiny", parent=base["Normal"],
            fontName="Helvetica", fontSize=6, textColor=colors.HexColor("#475569"),
            leading=7.5,
        ),
        "mono": ParagraphStyle(
            "mono", parent=base["Normal"],
            fontName="Courier", fontSize=6, textColor=colors.HexColor("#1e293b"),
            leading=7,
        ),
    }


# ===== Helpers de XML =====
def _parse_xml(xml_bytes: bytes) -> dict:
    """Extrae los datos relevantes del XML CFDI 4.0 timbrado."""
    root = ET.fromstring(xml_bytes)
    tfd = root.find(".//tfd:TimbreFiscalDigital", NS)
    emisor = root.find("cfdi:Emisor", NS)
    receptor = root.find("cfdi:Receptor", NS)

    return {
        "version": root.attrib.get("Version", "4.0"),
        "serie": root.attrib.get("Serie", ""),
        "folio": root.attrib.get("Folio", ""),
        "fecha": root.attrib.get("Fecha", ""),
        "no_certificado_emisor": root.attrib.get("NoCertificado", ""),
        "sello_cfd": root.attrib.get("Sello", ""),
        "lugar_expedicion": root.attrib.get("LugarExpedicion", ""),
        "subtotal": root.attrib.get("SubTotal", "0"),
        "total": root.attrib.get("Total", "0"),
        "moneda": root.attrib.get("Moneda", "MXN"),
        "forma_pago": root.attrib.get("FormaPago", ""),
        "metodo_pago": root.attrib.get("MetodoPago", ""),
        "tipo_comprobante": root.attrib.get("TipoDeComprobante", "I"),
        "emisor_rfc": emisor.attrib.get("Rfc", "") if emisor is not None else "",
        "emisor_nombre": emisor.attrib.get("Nombre", "") if emisor is not None else "",
        "emisor_regimen": emisor.attrib.get("RegimenFiscal", "") if emisor is not None else "",
        "receptor_rfc": receptor.attrib.get("Rfc", "") if receptor is not None else "",
        "receptor_nombre": receptor.attrib.get("Nombre", "") if receptor is not None else "",
        "receptor_regimen": receptor.attrib.get("RegimenFiscalReceptor", "") if receptor is not None else "",
        "receptor_cp": receptor.attrib.get("DomicilioFiscalReceptor", "") if receptor is not None else "",
        "uso_cfdi": receptor.attrib.get("UsoCFDI", "") if receptor is not None else "",
        # TimbreFiscalDigital
        "uuid": tfd.attrib.get("UUID", "") if tfd is not None else "",
        "fecha_timbrado": tfd.attrib.get("FechaTimbrado", "") if tfd is not None else "",
        "rfc_prov_certif": tfd.attrib.get("RfcProvCertif", "") if tfd is not None else "",
        "sello_sat": tfd.attrib.get("SelloSAT", "") if tfd is not None else "",
        "no_certificado_sat": tfd.attrib.get("NoCertificadoSAT", "") if tfd is not None else "",
    }


def _cadena_original_complemento(d: dict) -> str:
    """Construye la cadena original del complemento de timbrado SAT."""
    return f"||1.1|{d['uuid']}|{d['fecha_timbrado']}|{d['rfc_prov_certif']}|{d['sello_cfd']}|{d['no_certificado_sat']}||"


def _qr_url(d: dict) -> str:
    """Construye la URL para QR oficial SAT.
    Formato: https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?&id={UUID}&re={Emisor.Rfc}&rr={Receptor.Rfc}&tt={total}&fe={ultimos 8 caracteres SelloCFD}
    """
    total = float(d["total"])
    total_fmt = f"{total:018.6f}"  # 18 enteros + 6 decimales
    sello_tail = d["sello_cfd"][-8:] if d["sello_cfd"] else ""
    return (
        f"https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?"
        f"&id={d['uuid']}&re={d['emisor_rfc']}&rr={d['receptor_rfc']}"
        f"&tt={total_fmt}&fe={sello_tail}"
    )


def _qr_image(url: str) -> io.BytesIO:
    qr = qrcode.QRCode(box_size=4, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


# ===== Helpers de formato =====
def _fmt_dinero(n) -> str:
    try:
        n = float(n)
    except Exception:
        n = 0.0
    return "$" + f"{n:,.2f}"


def _fmt_fecha_iso(s: str) -> str:
    """2026-06-11T14:23:45 -> 11/06/2026 14:23:45"""
    if not s:
        return ""
    try:
        s = s.replace("Z", "")
        dt = datetime.fromisoformat(s.split("+")[0])
        return dt.strftime("%d/%m/%Y %H:%M:%S")
    except Exception:
        return s


def _nombre_forma_pago(c: str) -> str:
    m = {
        "01": "01 - Efectivo", "02": "02 - Cheque nominativo",
        "03": "03 - Transferencia electronica", "04": "04 - Tarjeta de credito",
        "05": "05 - Monedero electronico", "06": "06 - Dinero electronico",
        "08": "08 - Vales de despensa", "12": "12 - Dacion en pago",
        "13": "13 - Pago por subrogacion", "14": "14 - Pago por consignacion",
        "15": "15 - Condonacion", "17": "17 - Compensacion",
        "23": "23 - Novacion", "24": "24 - Confusion",
        "25": "25 - Remision de deuda", "26": "26 - Prescripcion o caducidad",
        "27": "27 - A satisfaccion del acreedor", "28": "28 - Tarjeta de debito",
        "29": "29 - Tarjeta de servicios", "30": "30 - Aplicacion de anticipos",
        "31": "31 - Intermediario pagos", "99": "99 - Por definir",
    }
    return m.get(c, c)


def _nombre_metodo_pago(c: str) -> str:
    return {"PUE": "PUE - Pago en una sola exhibicion", "PPD": "PPD - Pago en parcialidades o diferido"}.get(c, c)


# ===== Layout =====
PAGE_W, PAGE_H = letter
MARGIN_LR = 14 * mm
MARGIN_T = 14 * mm
MARGIN_B = 24 * mm  # extra abajo para footer


class _CfdiPdfDoc(BaseDocTemplate):
    """Doc template con footer en cada pagina."""
    def __init__(self, buf, uuid: str, **kw):
        super().__init__(buf, pagesize=letter,
                         leftMargin=MARGIN_LR, rightMargin=MARGIN_LR,
                         topMargin=MARGIN_T, bottomMargin=MARGIN_B, **kw)
        self.uuid = uuid
        frame = Frame(
            self.leftMargin, self.bottomMargin,
            self.width, self.height, id="body",
            leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        )
        self.addPageTemplates([PageTemplate(id="cfdi", frames=frame, onPage=self._footer)])

    def _footer(self, canvas, doc):
        canvas.saveState()
        # Linea separadora
        canvas.setStrokeColor(colors.HexColor("#cbd5e1"))
        canvas.setLineWidth(0.5)
        y = MARGIN_B - 12
        canvas.line(MARGIN_LR, y, PAGE_W - MARGIN_LR, y)

        # Texto principal del footer
        canvas.setFont("Helvetica-Bold", 7.5)
        canvas.setFillColor(colors.HexColor("#475569"))
        canvas.drawCentredString(
            PAGE_W / 2, y - 10,
            "ESTA ES UNA REPRESENTACION IMPRESA DE UN CFDI"
        )
        # UUID y pagina
        canvas.setFont("Helvetica", 6.5)
        canvas.setFillColor(colors.HexColor("#94a3b8"))
        canvas.drawString(MARGIN_LR, y - 22, f"Folio fiscal (UUID): {self.uuid}")
        canvas.drawRightString(PAGE_W - MARGIN_LR, y - 22, f"Pagina {doc.page}")
        canvas.restoreState()


def _logo_path(rfc_emisor: str) -> str | None:
    """Busca el logo bajo backend/app/static/logos/{rfc}.png|jpg|jpeg
    O un fallback empresa_<id>.png si lo metieras nombrado por id.
    """
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # app/
    base = os.path.join(here, "static", "logos")
    for ext in ("png", "jpg", "jpeg", "PNG", "JPG"):
        p = os.path.join(base, f"{rfc_emisor}.{ext}")
        if os.path.exists(p):
            return p
    return None


def generar_pdf_cfdi(
    db: Session, cfdi_id: int, empresa_id: int, xml_bytes: bytes,
) -> bytes:
    """Genera el PDF a partir del CFDI en BD + XML timbrado.

    El XML lo necesitamos para extraer sellos y cadenas oficiales.
    """
    cfdi = db.get(Cfdi, cfdi_id)
    if not cfdi:
        raise ValueError("CFDI no existe")
    doc = db.get(DocumentoVenta, cfdi.documento_venta_id)
    if not doc:
        raise ValueError("Documento no existe")
    if doc.empresa_id != empresa_id:
        raise ValueError("CFDI de otra empresa")

    empresa = db.get(Empresa, doc.empresa_id)
    cliente = db.get(Cliente, doc.cliente_id)
    conceptos = db.query(ConceptoVenta).filter(ConceptoVenta.documento_id == doc.id).all()
    pagos = db.query(Pago).filter(Pago.documento_id == doc.id).all()

    d = _parse_xml(xml_bytes)
    cadena = _cadena_original_complemento(d)
    qr_url = _qr_url(d)
    qr_img = _qr_image(qr_url)

    S = _estilos()
    buf = io.BytesIO()
    pdf = _CfdiPdfDoc(buf, uuid=d["uuid"])

    story = []

    # ===== Header: logo izquierda + datos emisor + box CFDI derecha =====
    logo_path = _logo_path(empresa.rfc)
    if logo_path:
        try:
            logo = Image(logo_path, width=22 * mm, height=22 * mm, kind="proportional")
        except Exception:
            logo = Paragraph("", S["normal"])
    else:
        logo = Paragraph("", S["normal"])

    emisor_html = (
        f"<b>{empresa.razon_social or empresa.nombre}</b><br/>"
        f"<font size='8' color='#475569'>"
        f"RFC: <b>{empresa.rfc}</b> &middot; "
        f"Regimen fiscal: <b>{empresa.regimen_fiscal or '-'}</b><br/>"
        f"Lugar de expedicion (CP): <b>{empresa.codigo_postal or '-'}</b>"
        f"</font>"
    )
    emisor_par = Paragraph(emisor_html, S["normal"])

    box_cfdi_html = (
        f"<b>FACTURA CFDI</b><br/>"
        f"<font size='8' color='#475569'>"
        f"Serie-Folio: <b>{d['serie']}-{d['folio']}</b><br/>"
        f"UUID: <font size='6'><b>{d['uuid']}</b></font><br/>"
        f"Fecha timbrado: <b>{_fmt_fecha_iso(d['fecha_timbrado'])}</b>"
        f"</font>"
    )
    box_cfdi = Paragraph(box_cfdi_html, S["normal"])

    header_tbl = Table(
        [[logo, emisor_par, box_cfdi]],
        colWidths=[25 * mm, 90 * mm, 73 * mm],
    )
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 1.5, colors.HexColor("#0f172a")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(header_tbl)
    story.append(Spacer(1, 6))

    # ===== Datos receptor + datos CFDI extra (lado a lado) =====
    receptor_html = (
        f"<b>{cliente.razon_social or cliente.nombre}</b><br/>"
        f"<font size='8' color='#475569'>"
        f"RFC: <b>{cliente.rfc or '-'}</b><br/>"
        f"CP: <b>{cliente.codigo_postal or '-'}</b><br/>"
        f"Regimen fiscal: <b>{cliente.regimen_fiscal or '-'}</b><br/>"
        f"Uso CFDI: <b>{d['uso_cfdi']}</b>"
        f"</font>"
    )
    cfdi_extra_html = (
        f"<font size='8' color='#475569'>"
        f"Forma de pago: <b>{_nombre_forma_pago(d['forma_pago'])}</b><br/>"
        f"Metodo de pago: <b>{_nombre_metodo_pago(d['metodo_pago'])}</b><br/>"
        f"Moneda: <b>{d['moneda']}</b><br/>"
        f"Tipo: <b>I (Ingreso)</b>"
        f"</font>"
    )
    body_tbl = Table(
        [[
            Paragraph("<b>RECEPTOR</b>", S["label"]),
            Paragraph("<b>DATOS DE LA OPERACION</b>", S["label"]),
        ], [Paragraph(receptor_html, S["normal"]), Paragraph(cfdi_extra_html, S["normal"])]],
        colWidths=[(PAGE_W - 2 * MARGIN_LR) / 2] * 2,
    )
    body_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(body_tbl)
    story.append(Spacer(1, 8))

    # ===== Conceptos =====
    story.append(Paragraph("<b>CONCEPTOS</b>", S["label"]))
    story.append(Spacer(1, 2))

    head = [
        "Cant", "Unidad", "Clave SAT", "Descripcion", "P. Unit.", "Importe",
    ]
    rows = [head]
    for c in conceptos:
        descripcion = Paragraph(
            f"{c.descripcion}", S["small"]
        )
        rows.append([
            f"{float(c.cantidad):g}",
            (c.clave_unidad_sat or "H87"),
            (c.clave_prod_serv_sat or "-"),
            descripcion,
            _fmt_dinero(c.precio_unitario),
            _fmt_dinero(c.importe),
        ])
    conceptos_tbl = Table(
        rows,
        colWidths=[14 * mm, 16 * mm, 18 * mm, 84 * mm, 22 * mm, 26 * mm],
        repeatRows=1,
    )
    conceptos_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("ALIGN", (0, 0), (0, -1), "RIGHT"),
        ("ALIGN", (4, 0), (5, -1), "RIGHT"),
        ("VALIGN", (0, 1), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(conceptos_tbl)
    story.append(Spacer(1, 8))

    # ===== Totales (derecha) =====
    iva_trasl = round(float(doc.iva), 2)
    iva_ret = round(float(getattr(doc, "iva_retenido", 0) or 0), 2)
    isr_ret = round(float(getattr(doc, "isr_retenido", 0) or 0), 2)
    rows_tot = [
        ["Subtotal", _fmt_dinero(doc.subtotal)],
        ["IVA trasladado (16%)", _fmt_dinero(iva_trasl)],
    ]
    if iva_ret > 0:
        rows_tot.append(["IVA retenido", "-" + _fmt_dinero(iva_ret)])
    if isr_ret > 0:
        rows_tot.append(["ISR retenido", "-" + _fmt_dinero(isr_ret)])
    rows_tot.append(["TOTAL", _fmt_dinero(doc.total)])

    tot_tbl = Table(rows_tot, colWidths=[40 * mm, 35 * mm])
    tot_tbl.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -2), 9),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEABOVE", (0, -1), (-1, -1), 1, colors.HexColor("#0f172a")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, -1), (-1, -1), 13),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (0, -1), (-1, -1), colors.white),
        ("LEFTPADDING", (0, -1), (-1, -1), 8),
        ("RIGHTPADDING", (0, -1), (-1, -1), 8),
        ("TOPPADDING", (0, -1), (-1, -1), 6),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 6),
    ]))

    # Wrap totales en una tabla mas amplia con espacio a la izquierda
    wrapper = Table([[Paragraph("", S["normal"]), tot_tbl]],
                    colWidths=[(PAGE_W - 2 * MARGIN_LR) - 75 * mm, 75 * mm])
    wrapper.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(wrapper)
    story.append(Spacer(1, 10))

    # ===== Observaciones (editable post-timbre, solo aparece en el PDF) =====
    obs_texto = (doc.observaciones or "").strip() if doc else ""
    if obs_texto:
        obs_html = (
            f"<b>OBSERVACIONES:</b> "
            f"<font color='#1e293b'>{obs_texto.replace(chr(10), '<br/>')}</font>"
        )
        obs_par = Paragraph(obs_html, S["small"])
        obs_tbl = Table(
            [[obs_par]],
            colWidths=[PAGE_W - 2 * MARGIN_LR],
        )
        obs_tbl.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#f59e0b")),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fef3c7")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(obs_tbl)
        story.append(Spacer(1, 10))

    # ===== QR + Sellos (en la ultima parte) =====
    qr_im = Image(qr_img, width=32 * mm, height=32 * mm)

    sellos_html = (
        f"<font size='6' color='#475569'><b>CADENA ORIGINAL DEL COMPLEMENTO DE CERTIFICACION DIGITAL DEL SAT:</b></font><br/>"
        f"<font size='5.5' face='Courier' color='#1e293b'>{cadena}</font><br/><br/>"
        f"<font size='6' color='#475569'><b>SELLO DIGITAL DEL CFDI:</b></font><br/>"
        f"<font size='5.5' face='Courier' color='#1e293b'>{d['sello_cfd']}</font><br/><br/>"
        f"<font size='6' color='#475569'><b>SELLO DIGITAL DEL SAT:</b></font><br/>"
        f"<font size='5.5' face='Courier' color='#1e293b'>{d['sello_sat']}</font><br/><br/>"
        f"<font size='6' color='#475569'>"
        f"No. Certificado SAT: <b>{d['no_certificado_sat']}</b> &middot; "
        f"No. Certificado emisor: <b>{d['no_certificado_emisor']}</b> &middot; "
        f"RFC PAC: <b>{d['rfc_prov_certif']}</b>"
        f"</font>"
    )
    sello_par = Paragraph(sellos_html, S["tiny"])

    qr_sello_tbl = Table(
        [[qr_im, sello_par]],
        colWidths=[36 * mm, (PAGE_W - 2 * MARGIN_LR) - 36 * mm],
    )
    qr_sello_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(qr_sello_tbl)

    pdf.build(story)
    return buf.getvalue()
