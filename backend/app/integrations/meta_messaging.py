"""Integracion con Meta Cloud API (WhatsApp Business + Messenger).

Doc oficiales:
  WA: https://developers.facebook.com/docs/whatsapp/cloud-api
  FB: https://developers.facebook.com/docs/messenger-platform/reference/send-api
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

log = logging.getLogger(__name__)

META_API_VERSION = "v20.0"
META_BASE = f"https://graph.facebook.com/{META_API_VERSION}"


class MetaError(Exception):
    """Error de Meta Graph API (rechazo de mensaje, plantilla no aprobada, etc.)."""


class WhatsAppClient:
    """Cliente para WhatsApp Cloud API. Se instancia con el canal."""

    def __init__(self, phone_number_id: str, access_token: str):
        self.phone_number_id = phone_number_id
        self.access_token = access_token
        self.base = f"{META_BASE}/{phone_number_id}"

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    def enviar_texto(self, telefono: str, texto: str) -> dict[str, Any]:
        """Envia mensaje de texto. Devuelve la respuesta de Meta con wamid.
        telefono: E.164 sin '+' (ej. 528341234567)."""
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": telefono,
            "type": "text",
            "text": {"preview_url": True, "body": texto[:4096]},
        }
        return self._post(payload)

    def enviar_plantilla(
        self, telefono: str, nombre_plantilla: str, idioma: str = "es_MX",
        variables: list[str] | None = None,
    ) -> dict[str, Any]:
        """Envia una plantilla pre-aprobada (necesario fuera de ventana 24h)."""
        components = []
        if variables:
            components.append({
                "type": "body",
                "parameters": [
                    {"type": "text", "text": str(v)} for v in variables
                ],
            })
        payload = {
            "messaging_product": "whatsapp",
            "to": telefono,
            "type": "template",
            "template": {
                "name": nombre_plantilla,
                "language": {"code": idioma},
                "components": components,
            },
        }
        return self._post(payload)

    def enviar_media(
        self, telefono: str, tipo: str, media_url: str,
        caption: str | None = None, filename: str | None = None,
    ) -> dict[str, Any]:
        """tipo: 'image' | 'audio' | 'video' | 'document' | 'sticker'"""
        media_obj: dict[str, Any] = {"link": media_url}
        if caption and tipo in {"image", "video", "document"}:
            media_obj["caption"] = caption
        if filename and tipo == "document":
            media_obj["filename"] = filename
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": telefono,
            "type": tipo,
            tipo: media_obj,
        }
        return self._post(payload)

    def marcar_leido(self, wamid: str) -> dict[str, Any]:
        """Marca un mensaje entrante como leido (para el check azul del cliente)."""
        payload = {
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": wamid,
        }
        return self._post(payload)

    def descargar_media(self, media_id: str) -> bytes:
        """Descarga un adjunto que llegó en un mensaje entrante.
        Meta primero da una URL firmada, luego descargamos con nuestro token."""
        with httpx.Client(timeout=30.0) as client:
            r = client.get(
                f"{META_BASE}/{media_id}",
                headers={"Authorization": f"Bearer {self.access_token}"},
            )
            if r.status_code >= 400:
                raise MetaError(f"Meta media metadata: HTTP {r.status_code}: {r.text}")
            url = r.json().get("url")
            if not url:
                raise MetaError("Meta no devolvio URL de media")
            r2 = client.get(
                url,
                headers={"Authorization": f"Bearer {self.access_token}"},
            )
            if r2.status_code >= 400:
                raise MetaError(f"Meta media download: HTTP {r2.status_code}")
            return r2.content

    def _post(self, payload: dict) -> dict[str, Any]:
        url = f"{self.base}/messages"
        try:
            with httpx.Client(timeout=15.0) as client:
                r = client.post(url, headers=self._headers(), json=payload)
        except httpx.HTTPError as e:
            raise MetaError(f"Fallo de red: {e}")
        if r.status_code >= 400:
            raise MetaError(f"HTTP {r.status_code}: {r.text}")
        return r.json()


class FacebookMessengerClient:
    """Cliente para Facebook Messenger Send API."""

    def __init__(self, page_id: str, access_token: str):
        self.page_id = page_id
        self.access_token = access_token

    def enviar_texto(self, psid: str, texto: str) -> dict[str, Any]:
        payload = {
            "recipient": {"id": psid},
            "message": {"text": texto[:2000]},
            "messaging_type": "RESPONSE",
        }
        return self._post(payload)

    def enviar_media(self, psid: str, tipo: str, media_url: str) -> dict[str, Any]:
        """tipo: 'image' | 'audio' | 'video' | 'file'"""
        payload = {
            "recipient": {"id": psid},
            "message": {
                "attachment": {
                    "type": tipo,
                    "payload": {"url": media_url, "is_reusable": True},
                }
            },
            "messaging_type": "RESPONSE",
        }
        return self._post(payload)

    def _post(self, payload: dict) -> dict[str, Any]:
        url = f"{META_BASE}/me/messages"
        params = {"access_token": self.access_token}
        try:
            with httpx.Client(timeout=15.0) as client:
                r = client.post(url, params=params, json=payload)
        except httpx.HTTPError as e:
            raise MetaError(f"Fallo de red: {e}")
        if r.status_code >= 400:
            raise MetaError(f"HTTP {r.status_code}: {r.text}")
        return r.json()


# ===== Parseo de webhooks entrantes =====

def parsear_webhook_whatsapp(payload: dict) -> list[dict]:
    """Extrae mensajes entrantes de un payload de webhook de WA Cloud API.

    Devuelve lista de dicts con: {
      phone_number_id, from_number, contact_name, wamid, tipo,
      texto, media_id, mime_type, filename, timestamp,
    }
    """
    resultado = []
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            metadata = value.get("metadata", {})
            phone_number_id = metadata.get("phone_number_id")
            contactos = {c.get("wa_id"): c.get("profile", {}).get("name") for c in value.get("contacts", [])}
            for msg in value.get("messages", []):
                m_from = msg.get("from")
                tipo = msg.get("type", "text")
                item = {
                    "phone_number_id": phone_number_id,
                    "from_number": m_from,
                    "contact_name": contactos.get(m_from),
                    "wamid": msg.get("id"),
                    "tipo": tipo,
                    "timestamp": int(msg.get("timestamp", "0")),
                    "texto": None,
                    "media_id": None,
                    "mime_type": None,
                    "filename": None,
                }
                if tipo == "text":
                    item["texto"] = msg.get("text", {}).get("body")
                elif tipo in {"image", "audio", "video", "document", "sticker"}:
                    media = msg.get(tipo, {})
                    item["media_id"] = media.get("id")
                    item["mime_type"] = media.get("mime_type")
                    item["filename"] = media.get("filename")
                    item["texto"] = media.get("caption")
                elif tipo == "location":
                    loc = msg.get("location", {})
                    item["texto"] = f"Ubicacion: {loc.get('latitude')}, {loc.get('longitude')}"
                elif tipo == "button" or tipo == "interactive":
                    item["texto"] = str(msg.get(tipo, {}))
                resultado.append(item)
    return resultado


def parsear_webhook_facebook(payload: dict) -> list[dict]:
    """Extrae mensajes de un payload de webhook de FB Messenger.

    Devuelve lista de dicts con: {
      page_id, sender_psid, mid, tipo, texto, attachments, timestamp,
    }
    """
    resultado = []
    for entry in payload.get("entry", []):
        page_id = entry.get("id")
        for msg_event in entry.get("messaging", []):
            sender = msg_event.get("sender", {}).get("id")
            msg = msg_event.get("message", {})
            if not msg:
                continue  # puede ser un delivery/read event
            item = {
                "page_id": page_id,
                "sender_psid": sender,
                "mid": msg.get("mid"),
                "tipo": "texto",
                "texto": msg.get("text"),
                "attachments": msg.get("attachments", []),
                "timestamp": msg_event.get("timestamp"),
            }
            if msg.get("attachments"):
                first = msg["attachments"][0]
                item["tipo"] = first.get("type", "texto")
            resultado.append(item)
    return resultado
