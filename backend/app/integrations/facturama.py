"""Cliente HTTP para Facturama (PAC para CFDI 4.0).

Las credenciales viven en la tabla `empresas`. El cliente recibe la empresa
y usa sus datos de Facturama.
"""
import base64
import httpx

from app.models import Empresa


class FacturamaError(Exception):
    pass


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
        # Si el documento tiene iva_retenido o isr_retenido > 0, aplicamos
        # la retencion proporcional en cada concepto.
        subtotal_doc = float(documento.subtotal or 0)
        iva_ret_total = float(getattr(documento, "iva_retenido", 0) or 0)
        isr_ret_total = float(getattr(documento, "isr_retenido", 0) or 0)
        tasa_iva_ret = (iva_ret_total / subtotal_doc) if subtotal_doc > 0 and iva_ret_total > 0 else 0
        tasa_isr_ret = (isr_ret_total / subtotal_doc) if subtotal_doc > 0 and isr_ret_total > 0 else 0

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
            # Total del concepto = Subtotal + IVA trasladado (las retenciones NO se restan
            # aqui - van como impuestos retenidos a nivel CFDI). Facturama valida que
            # SUM(Item.Total) coincida con Subtotal + Total IVA trasladado.
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
                "Total": round(importe + iva_calc, 2),
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
        try:
            return self._post("/3/cfdis", payload)
        except FacturamaError as e:
            # Log el payload completo para debug en Render Logs
            import json as _json
            logger.error("FACTURAMA RECHAZO. Payload: %s", _json.dumps(payload, default=str))
            logger.error("FACTURAMA ERROR: %s", str(e))
            raise

    def emitir_pago(self, payload: dict) -> dict:
        """Emite un CFDI tipo P (Pago) a Facturama."""
        return self._post("/3/cfdis", payload)

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
