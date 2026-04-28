"""Webhooks de Twilio WhatsApp.

Dos numeros:
  - Linea Ventas: webhook /api/whatsapp/ventas (CotizaExpress vive en repo aparte;
    este endpoint es para imagenes de comprobantes de pago entrantes)
  - Linea Cobranza: webhook /api/whatsapp/cobranza (recibe respuestas a mensajes
    de cobro)

El procesamiento real (parseo de comprobante con vision Claude, generacion de
mensajes de cobro) vive en services/whatsapp_service.py + integrations/anthropic_client.py
"""
from fastapi import APIRouter, Form, Request, Depends, BackgroundTasks
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import whatsapp_service

router = APIRouter()


@router.post("/ventas")
async def webhook_ventas(
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Twilio webhook - linea de ventas.

    Acciones detectadas:
      - Imagen/PDF -> conciliacion de pago (vision Claude)
      - Texto -> deferir a CotizaExpress (servicio externo)
    """
    form = await request.form()
    background.add_task(whatsapp_service.procesar_mensaje_ventas, dict(form))
    return {"ok": True}


@router.post("/cobranza")
async def webhook_cobranza(
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Twilio webhook - linea de cobranza.

    Capta respuestas de clientes a mensajes de cobro: promesas de pago,
    aclaraciones, comprobantes.
    """
    form = await request.form()
    background.add_task(whatsapp_service.procesar_mensaje_cobranza, dict(form))
    return {"ok": True}


@router.post("/cobranza/generar-tanda")
def generar_tanda_cobranza(dias_minimos: int = 15, db: Session = Depends(get_db)):
    """Endpoint que llama el cron de los lunes.

    Genera la lista de mensajes propuestos (Claude) para que el dueno apruebe.
    NO los manda - solo los deja en una bandeja interna.
    """
    return whatsapp_service.generar_tanda_cobro(db, dias_minimos)


@router.post("/cobranza/enviar")
def enviar_mensaje_cobro(mensaje_id: int, db: Session = Depends(get_db)):
    """Envia un mensaje aprobado por el dueno via Twilio."""
    return whatsapp_service.enviar_mensaje_aprobado(db, mensaje_id)
