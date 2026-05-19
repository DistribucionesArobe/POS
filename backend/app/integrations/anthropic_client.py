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

    def sugerir_clave_sat(
        self, nombre: str, categoria: str | None = None,
        marca: str | None = None, candidatos: list[dict] | None = None,
    ) -> dict:
        """Sugiere clave SAT eligiendo entre candidatos del catalogo real."""
        if not candidatos:
            return {"clave": "01010101", "descripcion": "Sin candidatos en catalogo", "confianza": "baja"}

        cand_text = "\n".join(
            f'{i+1}. {c["clave"]} — {c["descripcion"]}'
            for i, c in enumerate(candidatos)
        )
        prompt = f"""Eres experto fiscal mexicano. Para el siguiente producto, ELIGE la clave SAT mas apropiada de los candidatos.

Producto: {nombre}
Categoria: {categoria or "no especificada"}
Marca: {marca or "n/a"}

Candidatos (todos del catalogo oficial SAT c_ClaveProdServ):
{cand_text}

Responde SOLO JSON sin markdown:
{{"clave": "12345678", "descripcion": "...", "confianza": "alta|media|baja", "razon": "breve explicacion"}}

REGLAS:
- DEBES elegir UNA de las claves listadas arriba (no inventes otras)
- "alta" solo si tienes certeza fuerte
- "media" si es buen match pero podria ser otro
- "baja" si ningun candidato encaja bien (en ese caso elige el menos malo y marca baja)
- Si NINGUN candidato sirve, devuelve clave "01010101" con confianza "baja"
"""
        msg = self.client.messages.create(
            model=self.model,
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        text = msg.content[0].text.strip()
        if text.startswith("```"):
            text = text.strip("`").lstrip("json").strip()
        return json.loads(text)

    def sugerir_claves_sat_lote(
        self, productos: list[dict], candidatos_por_producto: dict,
    ) -> list[dict]:
        """Sugiere claves SAT por lote, cada uno con sus propios candidatos."""
        if not productos:
            return []
        bloques = []
        for p in productos:
            cands = candidatos_por_producto.get(p["id"], [])
            cand_text = "\n  ".join(
                f'{c["clave"]} - {c["descripcion"]}'
                for c in cands[:8]
            ) if cands else "(sin candidatos)"
            bloques.append(
                f'PRODUCTO_ID {p["id"]}: "{p["nombre"]}" '
                f'[familia: {p.get("categoria") or "n/a"}]\n  Opciones:\n  {cand_text}'
            )
        items_text = "\n\n".join(bloques)

        prompt = f"""Eres experto fiscal mexicano (catalogo SAT c_ClaveProdServ).

Para CADA producto, ELIGE la clave SAT mas apropiada de SUS opciones listadas (no de otras).

{items_text}

Responde SOLO un JSON array sin markdown, un objeto por producto:
[
  {{"id": 1, "clave": "12345678", "descripcion": "...", "confianza": "alta|media|baja"}},
  ...
]

REGLAS:
- DEBES devolver UN objeto por cada PRODUCTO_ID recibido (mismo id)
- La clave DEBE ser una de las opciones listadas para ese producto
- Si ninguna opcion encaja, usa "01010101" con confianza "baja"
- "alta" si reconoces claramente el producto en la descripcion del SAT
"""
        msg = self.client.messages.create(
            model=self.model,
            max_tokens=6000,
            messages=[{"role": "user", "content": prompt}],
        )
        text = msg.content[0].text.strip()
        if text.startswith("```"):
            text = text.strip("`").lstrip("json").strip()
        return json.loads(text)

    def parsear_cotizacion_imagen(self, image_bytes: bytes, mime_type: str = "image/jpeg") -> list[dict]:
        """Vision: extrae las lineas de una cotizacion (descripcion, unidad, cantidad, precio)."""
        b64 = base64.b64encode(image_bytes).decode()
        msg = self.client.messages.create(
            model=self.model,
            max_tokens=4000,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {
                        "type": "base64", "media_type": mime_type, "data": b64,
                    }},
                    {"type": "text", "text": (
                        "Esta es una cotizacion/orden de compra mexicana. "
                        "Extrae CADA linea de producto y devuelve SOLO un JSON array sin markdown, "
                        "un objeto por linea con estas llaves: "
                        "descripcion (string), unidad (string ej Pieza/Kit/Paquete/Kg), "
                        "cantidad (number), precio (number, precio unitario), monto (number, total de la linea). "
                        "REGLAS: "
                        "1. No incluyas subtotales, IVA, totales, ni filas de resumen. "
                        "2. Solo las filas de productos reales. "
                        "3. Si la cotizacion tiene 9 productos, devuelve 9 objetos. "
                        "4. Numeros sin signos de pesos, sin comas. "
                        "5. Si un campo no es legible, usa null."
                    )},
                ],
            }],
        )
        text = msg.content[0].text.strip()
        if text.startswith("```"):
            text = text.strip("`").lstrip("json").strip()
        return json.loads(text)

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
