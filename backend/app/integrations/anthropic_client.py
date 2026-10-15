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

    def parsear_cotizacion_imagen(self, file_bytes: bytes, mime_type: str = "image/jpeg") -> list[dict]:
        """Vision: extrae lineas de cotizacion. Acepta image/* o application/pdf."""
        b64 = base64.b64encode(file_bytes).decode()
        # Claude soporta PDFs nativamente con type=document
        if mime_type == "application/pdf":
            source_block = {
                "type": "document",
                "source": {"type": "base64", "media_type": "application/pdf", "data": b64},
            }
        else:
            source_block = {
                "type": "image",
                "source": {"type": "base64", "media_type": mime_type, "data": b64},
            }

        msg = self.client.messages.create(
            model=self.model,
            max_tokens=4000,
            messages=[{
                "role": "user",
                "content": [
                    source_block,
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

    def parsear_cotizacion_importacion(self, file_bytes: bytes, mime_type: str = "application/pdf") -> list[dict]:
        """Vision: extrae lineas de cotizacion de proveedor internacional (importacion).
        Formato tipico: ITEM NO / ACTUAL SIZE / KG/PC / PCS/CTN / MOQ / FOB USD/PC.
        Devuelve lista con: descripcion, kg_pieza, precio_unit_usd, moq, pcs_ctn."""
        import json as _json
        b64 = base64.b64encode(file_bytes).decode()
        if mime_type == "application/pdf":
            source_block = {"type": "document", "source": {
                "type": "base64", "media_type": "application/pdf", "data": b64,
            }}
        else:
            source_block = {"type": "image", "source": {
                "type": "base64", "media_type": mime_type, "data": b64,
            }}

        msg = self.client.messages.create(
            model=self.model,
            max_tokens=8000,
            messages=[{
                "role": "user",
                "content": [
                    source_block,
                    {"type": "text", "text": (
                        "Esto es una cotizacion de proveedor internacional (China, EU, etc) para importar mercancia a Mexico. "
                        "Extrae CADA linea de producto en formato JSON array (sin markdown), un objeto por producto con estas llaves EXACTAS: "
                        "  descripcion: string (nombre + specs: 'ITEM_NO ACTUAL_SIZE' ej 'SXCWB-170 170x24x2900mm')\n"
                        "  kg_pieza: number (peso por pieza, columna KG/PC o KG/CTN dividido entre PCS/CTN)\n"
                        "  precio_unit_usd: number (precio unitario FOB en USD)\n"
                        "  moq: string|null (minimo de orden tal cual aparece, ej '30 CTNS' o '100 PCS')\n"
                        "  moq_piezas: number (MOQ convertido a PIEZAS totales: si dice '30 CTNS' y PCS/CTN=60, devuelve 1800. Si dice '100 PCS' devuelve 100. Si no hay MOQ, estima: para paneles/pisos pon 500, para accesorios/herrajes 1000, para LEDs 300.)\n"
                        "  pcs_ctn: number|null (piezas por caja/CTN si aparece)\n"
                        "  unidad: string (PZA|SQM|KG|CTN segun contexto)\n"
                        "REGLAS:\n"
                        "1. Un objeto por fila de producto (no agrupes secciones, no sumes).\n"
                        "2. Si una fila tiene '/' en kg_pieza o precio porque es accesorio dependiente, usa 0 o null.\n"
                        "3. Si el precio es USD/SQM o USD/CTN en vez de USD/PC, usa ese valor igual (user ajusta).\n"
                        "4. Ignora encabezados, titulos de seccion, filas totales. Solo productos reales.\n"
                        "5. Numeros sin $ ni comas. Devuelve 'null' solo si no es legible.\n"
                        "6. Si hay varias paginas, procesa TODAS las filas de todas las paginas.\n"
                        "7. moq_piezas SIEMPRE debe ser un numero entero positivo (nunca null)."
                    )},
                ],
            }],
        )
        text = msg.content[0].text.strip()
        if text.startswith("```"):
            text = text.strip("`").lstrip("json").strip()
        return _json.loads(text)


    def clasificar_iva_ieps(self, nombres: list[str]) -> list[dict]:
        """Dado un lote de nombres de producto en Mexico, clasifica cada uno con:
          - tasa_iva: 0 (basicos) o 0.16 (general) o 0.08 (frontera; dejar 0.16 por default)
          - tasa_ieps: 0, 0.08, 0.25, 0.265, 0.30, 0.53 segun categoria
          - clave_prod_serv_sat sugerida (8 digitos del catalogo)
          - razon corta
        Si duda, elige 16% IVA y 0% IEPS (default general).
        """
        import json as _json
        if not nombres:
            return []
        items_txt = "\n".join(f"{i+1}. {n}" for i, n in enumerate(nombres))
        prompt = f"""Eres experto fiscal mexicano (Ley IVA + Ley IEPS). Clasifica cada producto:

{items_txt}

REGLAS SAT:
IVA 0% (alimentos basicos NO procesados ni saborizados, LIFTE Art 2-A):
  - Agua natural embotellada <10L
  - Leche sin saborizar, huevos
  - Pan, tortillas, galletas simples sin cobertura/saborizante
  - Azucar, sal, cafe tostado puro (NO cafe instantaneo preparado)
  - Carne, pescado, verduras, frutas sin procesar
  - Harinas basicas, aceites comestibles
  - Alimento para mascotas (si es mascota)

IVA 16% (general):
  - Bebidas gaseosas, jugos, energeticos, aguas saborizadas
  - Dulces, chocolates, confiteria
  - Comida preparada (restaurant)
  - Alcohol, cerveza, licores (ADEMAS llevan IEPS)
  - Articulos no alimenticios

IEPS adicional (sobre IVA 16%):
  - Refresco con azucar: 0.08 (8%) [cuota IEPS variable]
  - Refresco con bajo azucar/light: 0 (no causa IEPS, pero si IVA)
  - Cerveza: 0.265 (aprox, variable por grados)
  - Vino de mesa: 0.265
  - Bebidas destiladas (whisky/vodka/tequila): 0.53
  - Cigarros: 0.16 cuota ad valorem (variable)
  - Chatarra alta densidad calorica (galletas, chocolates, botanas con >=275kcal/100g): 0.08
  - Combustibles: cuota fija, pon 0 aqui

Responde SOLO JSON array sin markdown, un objeto por producto en el MISMO orden:
[
  {{"i": 1, "tasa_iva": 0, "tasa_ieps": 0, "clave_prod_serv_sat": "50202306", "razon": "Agua embotellada - basico"}},
  ...
]

Donde:
  i = numero de item (1-based)
  tasa_iva = 0 | 0.16 (nunca otro valor)
  tasa_ieps = 0 | 0.08 | 0.265 | 0.30 | 0.53
  clave_prod_serv_sat = 8 digitos del catalogo c_ClaveProdServ SAT, lo mejor que puedas
  razon = <=15 palabras explicando
"""
        msg = self.client.messages.create(
            model=self.model,
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}],
        )
        text = msg.content[0].text.strip()
        if text.startswith("```"):
            text = text.strip("`").lstrip("json").strip()
        return _json.loads(text)


    def parsear_csf(self, file_bytes: bytes, mime_type: str = "application/pdf") -> dict:
        """Vision: extrae datos fiscales de una Constancia de Situacion Fiscal del SAT."""
        b64 = base64.b64encode(file_bytes).decode()
        if mime_type == "application/pdf":
            source_block = {"type": "document", "source": {
                "type": "base64", "media_type": "application/pdf", "data": b64,
            }}
        else:
            source_block = {"type": "image", "source": {
                "type": "base64", "media_type": mime_type, "data": b64,
            }}
        msg = self.client.messages.create(
            model=self.model,
            max_tokens=800,
            messages=[{"role": "user", "content": [
                source_block,
                {"type": "text", "text": (
                    "Esta es una Constancia de Situacion Fiscal (CSF) del SAT mexicano. "
                    "Extrae los datos y devuelve SOLO un JSON sin markdown con estas llaves: "
                    "rfc (string, 12 o 13 chars), "
                    "razon_social (string, mayusculas tal cual aparece), "
                    "regimen_fiscal (string, 3 digitos - el codigo SAT, ej '601', '603', '612', '626'. "
                    "Mapeo: 'Personas Morales con Fines no Lucrativos'=603, 'General de Ley'=601, "
                    "'PF Actividad Empresarial'=612, 'RESICO'=626, 'Sueldos'=605, 'Asalariados'=605), "
                    "codigo_postal (string, 5 digitos del domicilio fiscal), "
                    "tipo_persona (string, 'fisica' o 'moral' - moral si tiene 12 chars RFC, fisica si 13), "
                    "nombre_comercial (string|null). "
                    "Si algun campo no es legible, usa null. Sin texto adicional."
                )},
            ]}],
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
