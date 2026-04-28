"""Cliente HTTP para Facturama (PAC para CFDI 4.0).

Doc oficial: https://apisandbox.facturama.com.mx/docs/api
Endpoints clave:
  POST /3/cfdis              -> emitir comprobante (Ingreso, Egreso, Pago)
  DELETE /cfdi/{id}?motive=  -> cancelar
  GET  /cfdi/{id}            -> consultar estatus
  GET  /cfdi/xml/issued/{id} -> bajar XML
  GET  /cfdi/pdf/issued/{id} -> bajar PDF
"""
import base64
import httpx

from app.config import get_settings


class FacturamaClient:
    def __init__(self):
        s = get_settings()
        self.base = s.facturama_api_url
        self.user = s.facturama_user
        self.password = s.facturama_password
        self.rfc_emisor = s.facturama_rfc_emisor
        self.regimen = s.facturama_regimen_fiscal
        self.lugar_expedicion = s.facturama_lugar_expedicion

    @property
    def auth(self) -> tuple[str, str]:
        return (self.user, self.password)

    def emitir_ingreso(self, documento, cliente) -> dict:
        """Emite CFDI tipo I (ingreso).

        Construye el JSON segun esquema Facturama 3.x.
        """
        items = []
        for c in documento.conceptos:
            items.append({
                "ProductCode": c.clave_prod_serv_sat or "01010101",
                "IdentificationNumber": str(c.variante_id),
                "Description": c.descripcion,
                "Unit": "Pieza",
                "UnitCode": c.clave_unidad_sat or "H87",
                "UnitPrice": float(c.precio_unitario),
                "Quantity": float(c.cantidad),
                "Subtotal": float(c.importe),
                "TaxObject": "02",
                "Taxes": [{
                    "Total": round(float(c.importe) * float(c.tasa_iva), 2),
                    "Name": "IVA",
                    "Base": float(c.importe),
                    "Rate": float(c.tasa_iva),
                    "IsRetention": False,
                }],
                "Total": float(c.importe) * (1 + float(c.tasa_iva)),
            })

        payload = {
            "NameId": "1",  # Factura
            "CfdiType": "I",
            "PaymentForm": documento.forma_pago_sat,
            "PaymentMethod": documento.metodo_pago_sat,
            "Currency": documento.moneda or "MXN",
            "ExpeditionPlace": self.lugar_expedicion,
            "Issuer": {
                "FiscalRegime": self.regimen,
                "Rfc": self.rfc_emisor,
                "Name": "ACEROMAX",  # razon social del emisor
            },
            "Receiver": {
                "Rfc": cliente.rfc,
                "Name": cliente.razon_social or cliente.nombre,
                "FiscalRegime": cliente.regimen_fiscal or "616",
                "TaxZipCode": cliente.codigo_postal or "00000",
                "CfdiUse": documento.uso_cfdi or "G03",
            },
            "Items": items,
        }

        with httpx.Client(timeout=30) as client:
            r = client.post(f"{self.base}/3/cfdis", json=payload, auth=self.auth)
            r.raise_for_status()
            return r.json()

    def cancelar(self, cfdi_id_facturama: str, motivo: str, uuid_sustituye: str | None = None):
        """motivo: 01 | 02 | 03 | 04 (CFDI 4.0).
        Si motivo == 01, uuid_sustituye es obligatorio.
        """
        params = {"motive": motivo}
        if uuid_sustituye:
            params["uuidReplacement"] = uuid_sustituye
        with httpx.Client(timeout=30) as client:
            r = client.delete(
                f"{self.base}/cfdi/{cfdi_id_facturama}", params=params, auth=self.auth
            )
            r.raise_for_status()
            return r.json()

    def descargar_pdf(self, cfdi_id_facturama: str) -> bytes:
        with httpx.Client(timeout=60) as client:
            r = client.get(
                f"{self.base}/cfdi/pdf/issued/{cfdi_id_facturama}", auth=self.auth
            )
            r.raise_for_status()
            data = r.json()
            return base64.b64decode(data["Content"])

    def descargar_xml(self, cfdi_id_facturama: str) -> bytes:
        with httpx.Client(timeout=60) as client:
            r = client.get(
                f"{self.base}/cfdi/xml/issued/{cfdi_id_facturama}", auth=self.auth
            )
            r.raise_for_status()
            data = r.json()
            return base64.b64decode(data["Content"])
