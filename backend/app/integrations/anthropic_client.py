"""Cliente Anthropic / Claude.

Casos de uso:
  - Redactar mensajes de cobranza personalizados
  - Vision multimodal: parsear comprobantes de pago (imagen/PDF)
  - Reportes en lenguaje natural (asistente del dueno)
"""
import base64
import json
from anthropic import Anthropic

from app.config import get_settings


class ClaudeClient:
    def __init__(self):
        s = get_settings()
        self.client = Anthropic(api_key=s.anthropic_api_key)
        self.model = s.anthropic_model

    def redactar_mensaje_cobro(
        self,
        nombre_cliente: str,
        saldo_total: float,
        dias_max: int,
        documentos: list[dict],
    ) -> str:
        """Genera mensaje de cobranza adaptado a antiguedad."""
        if dias_max <= 30:
            tono = "amable, recordatorio cortes"
        elif dias_max <= 60:
            tono = "firme pero educado, mencionar urgencia"
        else:
            tono = "muy firme, pedir contacto inmediato y sugerir plan de pago"

        prompt = f"""Eres asistente de cobranza de Aceromax (ferreteria/aceros).
Redacta UN mensaje de WhatsApp para cobrar a un cliente. Tono: {tono}.
NO uses emojis. Maximo 4 lineas. Cierra con \"Aceromax\".

Cliente: {nombre_cliente}
Saldo total: ${saldo_total:,.2f} MXN
Documento mas viejo: {dias_max} dias
Documentos pendientes: {json.dumps(documentos, ensure_ascii=False)}
"""
        msg = self.client.messages.create(
            model=self.model,
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()

    def parsear_comprobante_pago(self, image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
        """Vision: extrae datos estructurados de un comprobante de transferencia."""
        b64 = base64.b64encode(image_bytes).decode()
        msg = self.client.messages.create(
            model=self.model,
            max_tokens=600,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {
                        "type": "base64", "media_type": mime_type, "data": b64,
                    }},
                    {"type": "text", "text": (
                        "Extrae del comprobante de pago/transferencia los siguientes campos "
                        "y devuelvelos SOLO como JSON con estas llaves: "
                        "monto (number), fecha (YYYY-MM-DD), banco_origen, banco_destino, "
                        "referencia, titular_origen, cuenta_destino_ultimos4. "
                        "Si un campo no es legible usa null. Sin texto adicional."
                    )},
                ],
            }],
        )
        text = msg.content[0].text.strip()
        # Tolerar respuesta envuelta en ```json
        if text.startswith("```"):
            text = text.strip("`").lstrip("json").strip()
        return json.loads(text)
