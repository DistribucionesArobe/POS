"""Envio de correos via SMTP propio.

Lee config de env vars:
  SMTP_HOST           ej. smtp.gmail.com
  SMTP_PORT           ej. 587 (TLS) o 465 (SSL)
  SMTP_USER           cuenta remitente (ej. acero2@aceromax.mx)
  SMTP_PASSWORD       app password (NO la pass normal de Gmail/Workspace)
  SMTP_FROM_NAME      nombre que ve el cliente (opcional, default usa razon_social)
  SMTP_USE_SSL        "true" para puerto 465; default false (usa STARTTLS en 587)
"""
import os
import smtplib
from email.message import EmailMessage


def _config() -> dict | None:
    host = os.environ.get("SMTP_HOST", "").strip()
    user = os.environ.get("SMTP_USER", "").strip()
    pwd = os.environ.get("SMTP_PASSWORD", "").strip()
    if not (host and user and pwd):
        return None
    return {
        "host": host,
        "port": int(os.environ.get("SMTP_PORT", "587")),
        "user": user,
        "password": pwd,
        "from_name": os.environ.get("SMTP_FROM_NAME", "").strip(),
        "use_ssl": os.environ.get("SMTP_USE_SSL", "false").lower() in ("1", "true", "yes"),
    }


def smtp_configurado() -> bool:
    return _config() is not None


def enviar_cfdi(
    destinatario: str,
    nombre_destinatario: str,
    uuid: str,
    serie: str,
    folio: str,
    rfc_emisor: str,
    razon_social_emisor: str,
    xml_bytes: bytes | None,
    pdf_bytes: bytes | None,
) -> tuple[bool, str | None]:
    """Envia XML + PDF como adjuntos. Devuelve (ok, mensaje_error)."""
    cfg = _config()
    if not cfg:
        return False, "SMTP no configurado (faltan SMTP_HOST/SMTP_USER/SMTP_PASSWORD)"

    from_name = cfg["from_name"] or razon_social_emisor or "Facturación"
    folio_full = f"{serie}-{folio}" if serie else str(folio)

    msg = EmailMessage()
    msg["From"] = f'"{from_name}" <{cfg["user"]}>'
    msg["To"] = destinatario
    msg["Subject"] = f"Tu factura electrónica - {razon_social_emisor} - Folio {folio_full}"
    msg.set_content(
        f"""Hola {nombre_destinatario or ''},

Adjunto encontrarás tu factura electrónica CFDI 4.0:

  Emisor:  {razon_social_emisor} ({rfc_emisor})
  Folio:   {folio_full}
  UUID:    {uuid}

Archivos adjuntos:
  - XML : valido fiscalmente, conservalo
  - PDF : representacion impresa

Si tienes dudas, responde a este correo.

{razon_social_emisor}
"""
    )

    if xml_bytes:
        msg.add_attachment(
            xml_bytes, maintype="application", subtype="xml",
            filename=f"{uuid}.xml",
        )
    if pdf_bytes:
        msg.add_attachment(
            pdf_bytes, maintype="application", subtype="pdf",
            filename=f"{uuid}.pdf",
        )

    try:
        if cfg["use_ssl"]:
            with smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=20) as s:
                s.login(cfg["user"], cfg["password"])
                s.send_message(msg)
        else:
            with smtplib.SMTP(cfg["host"], cfg["port"], timeout=20) as s:
                s.ehlo()
                s.starttls()
                s.ehlo()
                s.login(cfg["user"], cfg["password"])
                s.send_message(msg)
        return True, None
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"
