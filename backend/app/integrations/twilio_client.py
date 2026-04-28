"""Cliente Twilio WhatsApp - dos numeros (ventas y cobranza)."""
from twilio.rest import Client

from app.config import get_settings


class TwilioClient:
    def __init__(self):
        s = get_settings()
        self._client = Client(s.twilio_account_sid, s.twilio_auth_token)
        self.from_ventas = s.twilio_ventas_from
        self.from_cobranza = s.twilio_cobranza_from

    def send_ventas(self, to_whatsapp: str, body: str, media_url: str | None = None):
        return self._send(self.from_ventas, to_whatsapp, body, media_url)

    def send_cobranza(self, to_whatsapp: str, body: str, media_url: str | None = None):
        return self._send(self.from_cobranza, to_whatsapp, body, media_url)

    def _send(self, from_: str, to: str, body: str, media_url: str | None):
        kwargs = {"from_": from_, "to": to, "body": body}
        if media_url:
            kwargs["media_url"] = [media_url]
        return self._client.messages.create(**kwargs)
