"""Procesamiento de WhatsApp: cobranza automatica + conciliacion por foto."""
from datetime import datetime
from sqlalchemy.orm import Session

from app.models import CuentaPorCobrar, Cliente
from app.integrations.anthropic_client import ClaudeClient
from app.integrations.twilio_client import TwilioClient


def procesar_mensaje_ventas(form: dict):
    """Webhook entrante linea ventas.

    Si trae adjunto (NumMedia > 0) -> conciliacion de pago
    Si solo texto -> deferir a CotizaExpress (servicio externo)
    """
    num_media = int(form.get("NumMedia", "0"))
    if num_media > 0:
        media_url = form.get("MediaUrl0")
        from_wa = form.get("From", "")
        # TODO: descargar la imagen, mandarla a Claude vision, parsear, sugerir aplicacion
        return {"accion": "conciliacion", "media": media_url, "from": from_wa}
    # Texto -> CotizaExpress se encarga (escucha el mismo numero o reciclamos via API)
    return {"accion": "ignorado_o_redirigido_cotizaexpress"}


def procesar_mensaje_cobranza(form: dict):
    """Webhook entrante linea cobranza."""
    body = form.get("Body", "")
    from_wa = form.get("From", "")
    # TODO: detectar promesa de pago, agendar recordatorio, log conversacion
    return {"body": body, "from": from_wa}


def generar_tanda_cobro(db: Session, dias_minimos: int = 15) -> list[dict]:
    """Cron de los lunes - genera mensajes propuestos por Claude para aprobacion."""
    today = datetime.utcnow().date()
    rows = (
        db.query(CuentaPorCobrar, Cliente)
        .join(Cliente, Cliente.id == CuentaPorCobrar.cliente_id)
        .filter(CuentaPorCobrar.pagado == False)
        .all()
    )

    # Agrupar por cliente
    por_cliente: dict[int, dict] = {}
    for cxc, cli in rows:
        dias = (today - cxc.fecha_emision.date()).days
        if dias < dias_minimos or not cli.whatsapp:
            continue
        agg = por_cliente.setdefault(cli.id, {
            "cliente": cli, "saldo_total": 0.0, "documentos": [], "max_dias": 0,
        })
        agg["saldo_total"] += float(cxc.saldo)
        agg["documentos"].append({"cxc_id": cxc.id, "saldo": float(cxc.saldo), "dias": dias})
        agg["max_dias"] = max(agg["max_dias"], dias)

    claude = ClaudeClient()
    propuestas = []
    for data in por_cliente.values():
        mensaje = claude.redactar_mensaje_cobro(
            nombre_cliente=data["cliente"].nombre,
            saldo_total=data["saldo_total"],
            dias_max=data["max_dias"],
            documentos=data["documentos"],
        )
        propuestas.append({
            "cliente_id": data["cliente"].id,
            "whatsapp": data["cliente"].whatsapp,
            "saldo": data["saldo_total"],
            "mensaje_propuesto": mensaje,
        })
    # TODO: persistir en una tabla mensajes_cobro_propuestos para que el dueno apruebe
    return propuestas


def enviar_mensaje_aprobado(db: Session, mensaje_id: int):
    """Toma un mensaje aprobado y lo manda via Twilio linea cobranza."""
    # TODO: leer de mensajes_cobro_propuestos, mandar via TwilioClient.send_cobranza
    raise NotImplementedError("Implementar en Fase 4")
