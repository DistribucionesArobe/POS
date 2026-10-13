"""Cliente HTTP para Facturama (PAC para CFDI 4.0).

Las credenciales viven en la tabla `empresas`. El cliente recibe la empresa
y usa sus datos de Facturama.
"""
import base64
import httpx

from app.models import Empresa


class FacturamaError(Exception):
    pass


# Catalogo SAT c_TasaOCuota — valores EXACTOS aceptados para RETENCION.
# Si la tasa calculada esta cerca de alguno, se "snapea" al valor del catalogo.
_SAT_TASAS_RETENCION = [
    0.160000,   # IVA 16% retenido (CFE/gobierno)
    0.106667,   # IVA 2/3 (10.6667%)
    0.040000,   # IVA 4%
    0.080000,   # IVA 8%
    0.013333,   # ISR servicios
    0.100000,   # ISR honorarios 10%
    0.012500,   # ISR arrendamiento
    0.006000,   # ISR plataformas tecnologicas
]


def _snap_tasa_sat_retencion(tasa_raw: float) -> float:
    """Ajusta una tasa calculada (division importe/subtotal) al valor exacto
    del catalogo SAT c_TasaOCuota mas cercano, si esta dentro de 0.001."""
    if tasa_raw <= 0:
        return 0
    for t_sat in _SAT_TASAS_RETENCION:
        if abs(tasa_raw - t_sat) < 0.001:
            return t_sat
    return round(tasa_raw, 6)


class FacturamaClient:
    def __init__(self, empresa: Empresa):
        if not empresa.facturama_user or not empresa.facturama_password:
            raise FacturamaError(
                f"Empresa {empresa.nombre} sin credenciales Facturama configuradas"
            )
        self.base = empresa.facturama_api_url.rstrip("/")
        self.user = empresa.facturama_user
        self.password = empresa.facturama_password
        self.rfc_emisor = empresa.rfc
        self.regimen = empresa.regimen_fiscal
        self.lugar_expedicion = empresa.codigo_postal
        self.razon_social_emisor = empresa.razon_social

    @property
    def auth(self) -> tuple[str, str]:
        return (self.user, self.password)

    def _post(self, path: str, payload: dict) -> dict:
        with httpx.Client(timeout=30) as c:
            r = c.post(f"{self.base}{path}", json=payload, auth=self.auth)
            if r.status_code >= 400:
                raise FacturamaError(f"HTTP {r.status_code}: {r.text}")
            return r.json()

    def _get(self, path: str) -> dict:
        with httpx.Client(timeout=60) as c:
            r = c.get(f"{self.base}{path}", auth=self.auth)
            if r.status_code >= 400:
                raise FacturamaError(f"HTTP {r.status_code}: {r.text}")
            return r.json()

    def _delete(self, path: str, params: dict | None = None) -> dict:
        with httpx.Client(timeout=30) as c:
            r = c.delete(f"{self.base}{path}", params=params, auth=self.auth)
            if r.status_code >= 400:
                raise FacturamaError(f"HTTP {r.status_code}: {r.text}")
            return r.json() if r.text else {}

    def emitir_ingreso(self, documento, cliente) -> dict:
        import logging
        logger = logging.getLogger(__name__)
        # Tasas de retencion (CFE retiene 16% IVA cuando compra a PF 612).
        # IMPORTANTE: CFDI 4.0 solo acepta valores EXACTOS del catalogo
        # c_TasaOCuota para retenciones. Por eso ajustamos ("snap") a los
        # valores validos mas cercanos cuando la division da un decimal raro
        # (ej. iva_retenido=536.66 / subtotal=3354.10 = 0.160001 => se queja).
        subtotal_doc = float(documento.subtotal or 0)
        iva_ret_total = float(getattr(documento, "iva_retenido", 0) or 0)
        isr_ret_total = float(getattr(documento, "isr_retenido", 0) or 0)
        tasa_iva_ret_raw = iva_ret_total / subtotal_doc if subtotal_doc > 0 and iva_ret_total > 0 else 0
        tasa_isr_ret_raw = isr_ret_total / subtotal_doc if subtotal_doc > 0 and isr_ret_total > 0 else 0
        tasa_iva_ret = _snap_tasa_sat_retencion(tasa_iva_ret_raw)
        tasa_isr_ret = _snap_tasa_sat_retencion(tasa_isr_ret_raw)

        items = []
        for c in documento.conceptos:
            importe = float(c.importe)
            tasa = float(c.tasa_iva)
            iva_calc = round(importe * tasa, 2)
            taxes = [{
                "Total": iva_calc, "Name": "IVA", "Base": importe,
                "Rate": tasa, "IsRetention": False,
            }]
            iva_ret_concepto = round(importe * tasa_iva_ret, 2)
            isr_ret_concepto = round(importe * tasa_isr_ret, 2)
            if tasa_iva_ret > 0:
                taxes.append({
                    "Total": iva_ret_concepto, "Name": "IVA",
                    "Base": importe, "Rate": tasa_iva_ret,
                    "IsRetention": True,
                })
            if tasa_isr_ret > 0:
                taxes.append({
                    "Total": isr_ret_concepto, "Name": "ISR",
                    "Base": importe, "Rate": tasa_isr_ret,
                    "IsRetention": True,
                })
            # Facturama valida: Item.Total = Subtotal + sum(Traslados) - sum(Retenidos)
            # Sin retenciones: Item.Total = Subtotal + IVA = importe + iva_calc
            # Con retencion: Item.Total = importe + iva_calc - iva_ret - isr_ret
            item_total = round(importe + iva_calc - iva_ret_concepto - isr_ret_concepto, 2)
            items.append({
                "ProductCode": c.clave_prod_serv_sat or "01010101",
                "IdentificationNumber": str(c.variante_id),
                "Description": c.descripcion,
                "Unit": "Pieza",
                "UnitCode": c.clave_unidad_sat or "H87",
                "UnitPrice": float(c.precio_unitario),
                "Quantity": float(c.cantidad),
                "Subtotal": importe,
                "TaxObject": "02",
                "Taxes": taxes,
                "Total": item_total,
            })

        payload = {
            "NameId": "1",
            "CfdiType": "I",
            "PaymentForm": documento.forma_pago_sat,
            "PaymentMethod": documento.metodo_pago_sat,
            "Currency": documento.moneda or "MXN",
            "ExpeditionPlace": self.lugar_expedicion,
            "Issuer": {
                "FiscalRegime": self.regimen,
                "Rfc": self.rfc_emisor,
                "Name": (self.razon_social_emisor or "EMISOR").upper(),
            },
            "Receiver": {
                "Rfc": cliente.rfc,
                "Name": (cliente.razon_social or cliente.nombre).upper(),
                "FiscalRegime": cliente.regimen_fiscal or "616",
                "TaxZipCode": cliente.codigo_postal or self.lugar_expedicion,
                "CfdiUse": documento.uso_cfdi or "G03",
            },
            "Items": items,
        }
        # Observaciones (texto libre que Facturama pone en el PDF, no en XML fiscal).
        # Se usa para numero de contrato, orden de compra, referencia del cliente.
        obs = getattr(documento, "observaciones", None)
        if obs:
            payload["Observations"] = obs
        try:
            return self._post("/3/cfdis", payload)
        except FacturamaError as e:
            import json as _json
            import re
            err_str = str(e)
            # Auto-retry: si Facturama rechaza por claves SAT invalidas,
            # sustituir esas claves por 01010101 (comodin universal SAT)
            # y reintentar UNA vez. Evita que el usuario tenga que arreglar
            # claves a mano cada vez.
            if "ProductCode" in err_str and "no se encuentra en los catalogos" in err_str:
                idxs = sorted(set(int(m) for m in re.findall(r"items\[(\d+)\]\.ProductCode", err_str)))
                claves_sustituidas = []
                for idx in idxs:
                    if 0 <= idx < len(payload["Items"]):
                        vieja = payload["Items"][idx]["ProductCode"]
                        desc = payload["Items"][idx].get("Description", "")
                        payload["Items"][idx]["ProductCode"] = "01010101"
                        claves_sustituidas.append(f"item[{idx}] '{desc[:30]}' {vieja}->01010101")
                if claves_sustituidas:
                    logger.warning("RETRY sustituyendo claves SAT invalidas: %s", claves_sustituidas)
                    try:
                        return self._post("/3/cfdis", payload)
                    except FacturamaError as e2:
                        logger.error("FACTURAMA RECHAZO tras retry. Payload: %s", _json.dumps(payload, default=str))
                        logger.error("FACTURAMA ERROR retry: %s", str(e2))
                        raise
            logger.error("FACTURAMA RECHAZO. Payload: %s", _json.dumps(payload, default=str))
            logger.error("FACTURAMA ERROR: %s", str(e))
            raise

    def emitir_pago(self, payload: dict) -> dict:
        """Emite un CFDI tipo P (Pago) a Facturama."""
        return self._post("/3/cfdis", payload)

    def emitir_factura_global(self, tickets: list, periodicidad: str,
                              mes: str, anio: int) -> dict:
        """Emite UN CFDI tipo I al publico en general que ampara varios tickets.

        tickets: lista de DocumentoVenta de tipo TICKET a facturar.
        periodicidad: 01 Diario, 02 Semanal, 03 Quincenal, 04 Mensual, 05 Bimestral.
        mes: '01' a '12' (o codigos 13 ene/feb bimestre, etc)
        anio: ej 2026
        """
        if not tickets:
            raise ValueError("No hay tickets para facturar")

        items = []
        for t in tickets:
            importe = float(t.subtotal or 0)
            iva = float(t.iva or 0)
            tasa = round(iva / importe, 6) if importe > 0 else 0.16
            iva_calc = round(importe * tasa, 2)
            items.append({
                "ProductCode": "01010101",   # comodin SAT
                "IdentificationNumber": str(t.id),
                "Description": f"Venta mostrador folio {t.folio} del {t.fecha.strftime('%d/%m/%Y')}",
                "Unit": "Pieza",
                "UnitCode": "ACT",             # ACT = Actividad
                "UnitPrice": importe,
                "Quantity": 1,
                "Subtotal": importe,
                "TaxObject": "02",
                "Taxes": [{
                    "Total": iva_calc, "Name": "IVA",
                    "Base": importe, "Rate": tasa, "IsRetention": False,
                }],
                "Total": importe + iva_calc,
            })

        payload = {
            "NameId": "1",
            "CfdiType": "I",
            "PaymentForm": "01",      # efectivo
            "PaymentMethod": "PUE",   # pago en una exhibicion
            "Currency": "MXN",
            "ExpeditionPlace": self.lugar_expedicion,
            "Issuer": {
                "FiscalRegime": self.regimen,
                "Rfc": self.rfc_emisor,
                "Name": (self.razon_social_emisor or "EMISOR").upper(),
            },
            "Receiver": {
                "Rfc": "XAXX010101000",
                "Name": "PUBLICO EN GENERAL",
                "FiscalRegime": "616",
                "TaxZipCode": self.lugar_expedicion,
                "CfdiUse": "S01",      # Sin efectos fiscales
            },
            # Nodo InformacionGlobal (requerido para factura global CFDI 4.0)
            "GlobalInformation": {
                "Periodicity": periodicidad,
                "Months": mes,
                "Year": int(anio),
            },
            "Items": items,
        }

        try:
            return self._post("/3/cfdis", payload)
        except FacturamaError as e:
            import json as _json
            logger.error("FACTURAMA RECHAZO FG. Payload: %s", _json.dumps(payload, default=str))
            logger.error("FACTURAMA ERROR FG: %s", str(e))
            raise

    def cancelar(self, cfdi_id: str, motivo: str, uuid_sustituye: str | None = None) -> dict:
        params = {"motive": motivo}
        if uuid_sustituye:
            params["uuidReplacement"] = uuid_sustituye
        return self._delete(f"/cfdi/{cfdi_id}", params=params)

    def enviar_por_correo(self, cfdi_id: str, email: str) -> bool:
        """Envia XML + PDF del CFDI al correo dado. Devuelve True si ok."""
        if not cfdi_id or not email:
            return False
        # Facturama acepta varios formatos del endpoint segun version; probamos
        # los mas comunes en orden. Cualquier 2xx se considera ok.
        candidatos = [
            ("GET",  f"/cfdi/{cfdi_id}/email", {"email": email}),
            ("POST", f"/cfdi/{cfdi_id}/email", {"email": email}),
            ("GET",  "/api/Email/Send", {"cfdiId": cfdi_id, "email": email}),
        ]
        with httpx.Client(timeout=30) as c:
            for method, path, params in candidatos:
                try:
                    r = c.request(
                        method, f"{self.base}{path}",
                        params=params, auth=self.auth,
                    )
                    if 200 <= r.status_code < 300:
                        return True
                except Exception:
                    continue
        return False

    def descargar_pdf(self, cfdi_id: str) -> bytes:
        data = self._get(f"/cfdi/pdf/issued/{cfdi_id}")
        return base64.b64decode(data["Content"])

    def descargar_xml(self, cfdi_id: str) -> bytes:
        data = self._get(f"/cfdi/xml/issued/{cfdi_id}")
        return base64.b64decode(data["Content"])
