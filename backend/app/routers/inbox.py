"""Modulo Mensajes Ventas - webhooks Meta + endpoints app."""
from __future__ import annotations

import logging
import secrets
import traceback
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from app.db import get_db, SessionLocal
from app.models import (
    CanalMensajeria, Conversacion, Mensaje, PlantillaWa,
    Cliente, Usuario, Empresa,
)
from app.services.security import get_active_empresa_id, get_current_user
from app.integrations import meta_messaging

log = logging.getLogger(__name__)
router = APIRouter()


# ==============================================================================
# WEBHOOKS - los llama Meta cuando llega un mensaje al numero WA o pagina FB
# ==============================================================================

@router.get("/webhook/whatsapp/{canal_id}")
def whatsapp_verify(canal_id: int, request: Request, db: Session = Depends(get_db)):
    """Meta llama este GET una sola vez al configurar el webhook.
    Debemos regresar el 'challenge' si el verify_token coincide."""
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")
    canal = db.get(CanalMensajeria, canal_id)
    if not canal or canal.tipo != "whatsapp":
        raise HTTPException(404, "Canal no existe")
    if mode == "subscribe" and token == canal.verify_token:
        return PlainTextResponse(challenge or "ok")
    raise HTTPException(403, "verify_token no coincide")


@router.post("/webhook/whatsapp/{canal_id}")
async def whatsapp_recibir(
    canal_id: int, request: Request, db: Session = Depends(get_db),
):
    """Meta llama este POST cada vez que llega un mensaje al numero."""
    try:
        payload = await request.json()
    except Exception:
        return {"status": "invalid_json"}
    canal = db.get(CanalMensajeria, canal_id)
    if not canal or canal.tipo != "whatsapp":
        return {"status": "canal_not_found"}
    try:
        mensajes_in = meta_messaging.parsear_webhook_whatsapp(payload)
        for m in mensajes_in:
            _procesar_mensaje_wa_entrante(db, canal, m)
        db.commit()
    except Exception as e:
        log.exception("Error procesando webhook WA: %s", e)
        # Aun asi devolvemos 200 para que Meta no reintente en loop
    return {"status": "ok"}


@router.get("/webhook/facebook/{canal_id}")
def facebook_verify(canal_id: int, request: Request, db: Session = Depends(get_db)):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")
    canal = db.get(CanalMensajeria, canal_id)
    if not canal or canal.tipo != "facebook":
        raise HTTPException(404, "Canal no existe")
    if mode == "subscribe" and token == canal.verify_token:
        return PlainTextResponse(challenge or "ok")
    raise HTTPException(403, "verify_token no coincide")


@router.post("/webhook/facebook/{canal_id}")
async def facebook_recibir(
    canal_id: int, request: Request, db: Session = Depends(get_db),
):
    try:
        payload = await request.json()
    except Exception:
        return {"status": "invalid_json"}
    canal = db.get(CanalMensajeria, canal_id)
    if not canal or canal.tipo != "facebook":
        return {"status": "canal_not_found"}
    try:
        mensajes_in = meta_messaging.parsear_webhook_facebook(payload)
        for m in mensajes_in:
            _procesar_mensaje_fb_entrante(db, canal, m)
        db.commit()
    except Exception as e:
        log.exception("Error procesando webhook FB: %s", e)
    return {"status": "ok"}


# ==============================================================================
# HELPERS - crear/actualizar conversacion + mensaje al recibir
# ==============================================================================

def _procesar_mensaje_wa_entrante(db: Session, canal: CanalMensajeria, m: dict):
    """Guarda el mensaje entrante WA. Crea conversacion si es nueva."""
    telefono = m["from_number"]
    if not telefono:
        return
    conv = _get_or_create_conversacion(
        db, canal, contacto_externo=telefono, nombre=m.get("contact_name"),
    )
    # Evitar duplicados por si Meta re-envia el webhook
    if m.get("wamid"):
        existente = db.query(Mensaje).filter(Mensaje.externo_id == m["wamid"]).first()
        if existente:
            return
    tipo_map = {
        "text": "texto", "image": "imagen", "audio": "audio",
        "video": "video", "document": "documento", "sticker": "imagen",
        "location": "ubicacion", "button": "texto", "interactive": "texto",
    }
    tipo_local = tipo_map.get(m.get("tipo"), "texto")
    msg = Mensaje(
        conversacion_id=conv.id,
        direccion="in",
        tipo=tipo_local,
        contenido=m.get("texto") or "",
        externo_id=m.get("wamid"),
        estado="entregado",
        creado_en=datetime.utcfromtimestamp(m["timestamp"]) if m.get("timestamp") else datetime.utcnow(),
    )
    if m.get("media_id"):
        msg.adjunto_url = f"meta://{m['media_id']}"  # descarga on-demand
        msg.adjunto_mime = m.get("mime_type")
        msg.adjunto_nombre = m.get("filename")
    db.add(msg)
    # Actualizar conversacion
    conv.ultimo_mensaje_en = msg.creado_en
    conv.ultimo_mensaje_direccion = "in"
    conv.ultimo_mensaje_preview = _preview(msg.contenido, tipo_local)
    conv.no_leidos = (conv.no_leidos or 0) + 1
    if conv.estado == "resuelta":
        conv.estado = "en_curso"  # el cliente re-escribio


def _procesar_mensaje_fb_entrante(db: Session, canal: CanalMensajeria, m: dict):
    psid = m.get("sender_psid")
    if not psid:
        return
    conv = _get_or_create_conversacion(
        db, canal, contacto_externo=psid, nombre=None,
    )
    if m.get("mid"):
        existente = db.query(Mensaje).filter(Mensaje.externo_id == m["mid"]).first()
        if existente:
            return
    tipo_local = m.get("tipo", "texto")
    if tipo_local not in {"texto", "imagen", "audio", "video", "documento"}:
        tipo_local = "texto"
    contenido = m.get("texto") or ""
    attach_url = None
    attach_mime = None
    if m.get("attachments"):
        first = m["attachments"][0]
        payload_att = first.get("payload", {})
        attach_url = payload_att.get("url")
    msg = Mensaje(
        conversacion_id=conv.id,
        direccion="in",
        tipo=tipo_local,
        contenido=contenido,
        externo_id=m.get("mid"),
        adjunto_url=attach_url,
        adjunto_mime=attach_mime,
        estado="entregado",
        creado_en=datetime.utcnow(),
    )
    db.add(msg)
    conv.ultimo_mensaje_en = datetime.utcnow()
    conv.ultimo_mensaje_direccion = "in"
    conv.ultimo_mensaje_preview = _preview(contenido, tipo_local)
    conv.no_leidos = (conv.no_leidos or 0) + 1
    if conv.estado == "resuelta":
        conv.estado = "en_curso"


def _get_or_create_conversacion(
    db: Session, canal: CanalMensajeria, contacto_externo: str, nombre: str | None,
) -> Conversacion:
    conv = (
        db.query(Conversacion)
        .filter(Conversacion.canal_id == canal.id)
        .filter(Conversacion.contacto_externo == contacto_externo)
        .filter(Conversacion.estado.in_(("nueva", "en_curso", "resuelta")))
        .order_by(Conversacion.id.desc())
        .first()
    )
    if conv:
        if nombre and not conv.contacto_nombre:
            conv.contacto_nombre = nombre
        return conv
    # Intentar match con Cliente por telefono (WA)
    cliente_id = None
    if canal.tipo == "whatsapp":
        cliente = _match_cliente_por_telefono(db, canal.empresa_id, contacto_externo)
        if cliente:
            cliente_id = cliente.id
            if not nombre:
                nombre = cliente.razon_social or cliente.nombre
    conv = Conversacion(
        empresa_id=canal.empresa_id,
        canal_id=canal.id,
        contacto_externo=contacto_externo,
        contacto_nombre=nombre,
        cliente_id=cliente_id,
        estado="nueva",
        ultimo_mensaje_en=datetime.utcnow(),
    )
    db.add(conv)
    db.flush()
    return conv


def _match_cliente_por_telefono(db: Session, empresa_id: int, telefono: str) -> Cliente | None:
    """Busca cliente por telefono. Meta manda E.164 sin '+' (ej. 528341234567).
    Nosotros guardamos 10 digitos, con lada, con +52, etc. Probamos varias."""
    if not telefono:
        return None
    ultimos10 = telefono[-10:]
    return (
        db.query(Cliente)
        .filter(Cliente.empresa_id == empresa_id)
        .filter(or_(
            Cliente.telefono == telefono,
            Cliente.telefono == "+" + telefono,
            Cliente.telefono == ultimos10,
            Cliente.whatsapp == telefono,
            Cliente.whatsapp == ultimos10,
        ))
        .first()
    )


def _preview(texto: str | None, tipo: str) -> str:
    if tipo == "imagen":
        return "📷 Imagen" + (f": {texto[:100]}" if texto else "")
    if tipo == "audio":
        return "🎤 Audio"
    if tipo == "video":
        return "🎥 Video" + (f": {texto[:100]}" if texto else "")
    if tipo == "documento":
        return "📄 Documento" + (f": {texto[:100]}" if texto else "")
    if tipo == "ubicacion":
        return "📍 " + (texto or "Ubicacion")
    return (texto or "")[:200]


# ==============================================================================
# ENDPOINTS APP - los usa el frontend del POS
# ==============================================================================

@router.get("/canales")
def listar_canales(
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Canales de mensajeria de la empresa activa."""
    rows = (
        db.query(CanalMensajeria)
        .filter(CanalMensajeria.empresa_id == empresa_id)
        .order_by(CanalMensajeria.nombre)
        .all()
    )
    return [
        {
            "id": c.id, "tipo": c.tipo, "nombre": c.nombre,
            "activo": c.activo, "externo_id": c.externo_id,
        }
        for c in rows
    ]


class CanalIn(BaseModel):
    tipo: str  # 'whatsapp' o 'facebook'
    nombre: str
    externo_id: str  # phone_number_id o page_id
    access_token: str
    waba_id: str | None = None


@router.post("/canales")
def crear_canal(
    payload: CanalIn,
    user: Usuario = Depends(get_current_user),
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    if not user.super_admin:
        raise HTTPException(403, "Solo super admin puede configurar canales")
    if payload.tipo not in ("whatsapp", "facebook"):
        raise HTTPException(400, "tipo debe ser whatsapp o facebook")
    verify = secrets.token_urlsafe(16)
    canal = CanalMensajeria(
        empresa_id=empresa_id,
        tipo=payload.tipo,
        nombre=payload.nombre,
        externo_id=payload.externo_id,
        access_token=payload.access_token,
        verify_token=verify,
        waba_id=payload.waba_id,
        activo=True,
    )
    db.add(canal)
    db.commit()
    db.refresh(canal)
    return {
        "id": canal.id,
        "verify_token": verify,
        "webhook_url_ejemplo": f"/api/inbox/webhook/{canal.tipo}/{canal.id}",
    }


@router.get("/conversaciones")
def listar_conversaciones(
    estado: str | None = Query(None, description="nueva|en_curso|resuelta|archivada"),
    canal_id: int | None = None,
    asignada_a: str | None = Query(None, description="'me' o id de usuario o 'sin_asignar'"),
    q: str | None = Query(None, description="busqueda en nombre contacto"),
    limit: int = 100,
    user: Usuario = Depends(get_current_user),
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    query = db.query(Conversacion).filter(Conversacion.empresa_id == empresa_id)
    if estado:
        query = query.filter(Conversacion.estado == estado)
    if canal_id:
        query = query.filter(Conversacion.canal_id == canal_id)
    if asignada_a == "me":
        query = query.filter(Conversacion.agente_id == user.id)
    elif asignada_a == "sin_asignar":
        query = query.filter(Conversacion.agente_id.is_(None))
    elif asignada_a and asignada_a.isdigit():
        query = query.filter(Conversacion.agente_id == int(asignada_a))
    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            Conversacion.contacto_nombre.ilike(like),
            Conversacion.contacto_externo.ilike(like),
        ))
    rows = query.order_by(Conversacion.ultimo_mensaje_en.desc()).limit(limit).all()
    return [_serialize_conv(c, db) for c in rows]


@router.get("/conversaciones/{conv_id}")
def obtener_conversacion(
    conv_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    c = db.get(Conversacion, conv_id)
    if not c or c.empresa_id != empresa_id:
        raise HTTPException(404, "Conversacion no existe")
    return _serialize_conv(c, db, incluir_cliente=True)


@router.get("/conversaciones/{conv_id}/mensajes")
def listar_mensajes(
    conv_id: int, limit: int = 200,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    c = db.get(Conversacion, conv_id)
    if not c or c.empresa_id != empresa_id:
        raise HTTPException(404, "Conversacion no existe")
    msgs = (
        db.query(Mensaje)
        .filter(Mensaje.conversacion_id == conv_id)
        .order_by(Mensaje.creado_en)
        .limit(limit)
        .all()
    )
    return [
        {
            "id": m.id, "direccion": m.direccion, "tipo": m.tipo,
            "contenido": m.contenido, "adjunto_url": m.adjunto_url,
            "adjunto_mime": m.adjunto_mime, "adjunto_nombre": m.adjunto_nombre,
            "estado": m.estado, "error_detalle": m.error_detalle,
            "agente_id": m.agente_id,
            "creado_en": m.creado_en.isoformat(),
        }
        for m in msgs
    ]


class ResponderIn(BaseModel):
    contenido: str
    tipo: str = "texto"
    adjunto_url: str | None = None
    plantilla_nombre: str | None = None
    plantilla_variables: list[str] | None = None


@router.post("/conversaciones/{conv_id}/responder")
def responder(
    conv_id: int, payload: ResponderIn,
    user: Usuario = Depends(get_current_user),
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    c = db.get(Conversacion, conv_id)
    if not c or c.empresa_id != empresa_id:
        raise HTTPException(404, "Conversacion no existe")
    canal = db.get(CanalMensajeria, c.canal_id)
    if not canal or not canal.activo:
        raise HTTPException(400, "Canal inactivo")

    # Guardar mensaje local primero como 'enviando'
    msg = Mensaje(
        conversacion_id=c.id,
        direccion="out",
        tipo=payload.tipo,
        contenido=payload.contenido,
        adjunto_url=payload.adjunto_url,
        estado="enviando",
        agente_id=user.id,
    )
    db.add(msg)
    db.flush()

    # Enviar por Meta
    try:
        if canal.tipo == "whatsapp":
            client = meta_messaging.WhatsAppClient(canal.externo_id, canal.access_token)
            if payload.plantilla_nombre:
                r = client.enviar_plantilla(
                    c.contacto_externo, payload.plantilla_nombre,
                    variables=payload.plantilla_variables,
                )
            elif payload.adjunto_url and payload.tipo in ("imagen", "audio", "video", "documento"):
                tipo_meta = {
                    "imagen": "image", "audio": "audio",
                    "video": "video", "documento": "document",
                }[payload.tipo]
                r = client.enviar_media(
                    c.contacto_externo, tipo_meta, payload.adjunto_url,
                    caption=payload.contenido,
                )
            else:
                r = client.enviar_texto(c.contacto_externo, payload.contenido or "")
            wamid = None
            try:
                wamid = r.get("messages", [{}])[0].get("id")
            except Exception:
                pass
            msg.externo_id = wamid
        else:  # facebook
            client = meta_messaging.FacebookMessengerClient(canal.externo_id, canal.access_token)
            if payload.adjunto_url and payload.tipo in ("imagen", "audio", "video", "documento"):
                tipo_meta = {
                    "imagen": "image", "audio": "audio",
                    "video": "video", "documento": "file",
                }[payload.tipo]
                r = client.enviar_media(c.contacto_externo, tipo_meta, payload.adjunto_url)
            else:
                r = client.enviar_texto(c.contacto_externo, payload.contenido or "")
            msg.externo_id = r.get("message_id")
        msg.estado = "enviado"
    except meta_messaging.MetaError as e:
        msg.estado = "error"
        msg.error_detalle = str(e)[:2000]
        db.commit()
        raise HTTPException(400, f"Meta rechazo: {e}")

    # Actualizar conversacion
    c.ultimo_mensaje_en = msg.creado_en
    c.ultimo_mensaje_direccion = "out"
    c.ultimo_mensaje_preview = _preview(payload.contenido, payload.tipo)
    c.no_leidos = 0  # al responder, damos por leidos los pendientes
    if c.estado == "nueva":
        c.estado = "en_curso"
    if not c.agente_id:
        c.agente_id = user.id  # auto-asignar al primero que responde
    db.commit()
    return {"ok": True, "mensaje_id": msg.id, "externo_id": msg.externo_id}


class NotaIn(BaseModel):
    contenido: str


@router.post("/conversaciones/{conv_id}/nota")
def agregar_nota(
    conv_id: int, payload: NotaIn,
    user: Usuario = Depends(get_current_user),
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Nota interna - solo la ven los agentes, no se manda al cliente."""
    c = db.get(Conversacion, conv_id)
    if not c or c.empresa_id != empresa_id:
        raise HTTPException(404, "Conversacion no existe")
    msg = Mensaje(
        conversacion_id=c.id,
        direccion="nota",
        tipo="texto",
        contenido=payload.contenido,
        estado="entregado",
        agente_id=user.id,
    )
    db.add(msg)
    db.commit()
    return {"ok": True, "mensaje_id": msg.id}


class AsignarIn(BaseModel):
    agente_id: int | None  # null = quitar asignacion


@router.patch("/conversaciones/{conv_id}/asignar")
def asignar(
    conv_id: int, payload: AsignarIn,
    user: Usuario = Depends(get_current_user),
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    c = db.get(Conversacion, conv_id)
    if not c or c.empresa_id != empresa_id:
        raise HTTPException(404, "Conversacion no existe")
    if payload.agente_id:
        u = db.get(Usuario, payload.agente_id)
        if not u:
            raise HTTPException(400, "Usuario no existe")
    c.agente_id = payload.agente_id
    db.commit()
    return {"ok": True}


class EstadoIn(BaseModel):
    estado: str  # nueva | en_curso | resuelta | archivada


@router.patch("/conversaciones/{conv_id}/estado")
def cambiar_estado(
    conv_id: int, payload: EstadoIn,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    if payload.estado not in ("nueva", "en_curso", "resuelta", "archivada"):
        raise HTTPException(400, "estado invalido")
    c = db.get(Conversacion, conv_id)
    if not c or c.empresa_id != empresa_id:
        raise HTTPException(404, "Conversacion no existe")
    c.estado = payload.estado
    if payload.estado == "resuelta":
        c.no_leidos = 0
    db.commit()
    return {"ok": True}


@router.post("/conversaciones/{conv_id}/marcar-leido")
def marcar_leido(
    conv_id: int,
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    c = db.get(Conversacion, conv_id)
    if not c or c.empresa_id != empresa_id:
        raise HTTPException(404, "Conversacion no existe")
    c.no_leidos = 0
    db.commit()
    return {"ok": True}


@router.get("/contador-no-leidos")
def contador_no_leidos(
    user: Usuario = Depends(get_current_user),
    empresa_id: int = Depends(get_active_empresa_id),
    db: Session = Depends(get_db),
):
    """Total de conversaciones con mensajes sin leer para el badge del sidebar."""
    total = (
        db.query(Conversacion)
        .filter(Conversacion.empresa_id == empresa_id)
        .filter(Conversacion.no_leidos > 0)
        .filter(Conversacion.estado.in_(("nueva", "en_curso")))
        .count()
    )
    mias = (
        db.query(Conversacion)
        .filter(Conversacion.empresa_id == empresa_id)
        .filter(Conversacion.agente_id == user.id)
        .filter(Conversacion.no_leidos > 0)
        .filter(Conversacion.estado.in_(("nueva", "en_curso")))
        .count()
    )
    sin_asignar = (
        db.query(Conversacion)
        .filter(Conversacion.empresa_id == empresa_id)
        .filter(Conversacion.agente_id.is_(None))
        .filter(Conversacion.estado.in_(("nueva", "en_curso")))
        .count()
    )
    return {"total": total, "mias": mias, "sin_asignar": sin_asignar}


# ==============================================================================
# SERIALIZADORES
# ==============================================================================

def _serialize_conv(c: Conversacion, db: Session, incluir_cliente: bool = False) -> dict:
    canal = c.canal
    d = {
        "id": c.id,
        "empresa_id": c.empresa_id,
        "canal_id": c.canal_id,
        "canal_nombre": canal.nombre if canal else "",
        "canal_tipo": canal.tipo if canal else "",
        "contacto_externo": c.contacto_externo,
        "contacto_nombre": c.contacto_nombre,
        "cliente_id": c.cliente_id,
        "agente_id": c.agente_id,
        "estado": c.estado,
        "ultimo_mensaje_en": c.ultimo_mensaje_en.isoformat() if c.ultimo_mensaje_en else None,
        "ultimo_mensaje_preview": c.ultimo_mensaje_preview,
        "ultimo_mensaje_direccion": c.ultimo_mensaje_direccion,
        "no_leidos": c.no_leidos or 0,
    }
    if incluir_cliente and c.cliente_id:
        cli = db.get(Cliente, c.cliente_id)
        if cli:
            d["cliente"] = {
                "id": cli.id, "nombre": cli.nombre,
                "razon_social": cli.razon_social, "rfc": cli.rfc,
                "telefono": cli.telefono, "correo": cli.correo,
            }
    if c.agente_id:
        agente = db.get(Usuario, c.agente_id)
        if agente:
            d["agente_nombre"] = agente.nombre
    return d
