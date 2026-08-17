"""Schemas Pydantic para ventas."""
from datetime import datetime
from pydantic import BaseModel, Field


class ConceptoVentaIn(BaseModel):
    variante_id: int
    cantidad: float = Field(gt=0)
    precio_unitario: float = Field(ge=0)
    descuento: float = 0
    # Override opcional de la unidad para este concepto. Si viene, sobreescribe
    # la unidad guardada en la variante (solo para este documento).
    unidad: str | None = None
    # Override opcional de la descripcion del concepto. Si viene, sobreescribe
    # la descripcion default '{producto.nombre} - {v.presentacion}' solo para
    # este documento (no toca el catalogo). Util para modificar texto antes de timbrar.
    descripcion: str | None = None
    # Override opcional de la clave SAT ProductCode. Si viene, se usa esta y
    # NO se actualiza el catalogo. Util para corregir claves invalidas al vuelo
    # sin tocar el producto original.
    clave_prod_serv_sat: str | None = None


class PagoIn(BaseModel):
    forma_pago_sat: str  # "01" efectivo, "03" transf, "04" cred, "28" debito
    monto: float = Field(gt=0)
    referencia: str | None = None


class DocumentoVentaIn(BaseModel):
    tipo: str  # TICKET | REMISION | FACTURA
    cliente_id: int
    vendedor_id: int | None = None
    forma_pago_sat: str = "01"
    metodo_pago_sat: str = "PUE"
    uso_cfdi: str | None = None
    notas: str | None = None
    conceptos: list[ConceptoVentaIn]
    # Si se mandan pagos, sustituyen al campo forma_pago_sat:
    # - 1 pago: usa esa forma_pago_sat
    # - 2+ pagos: forma_pago_sat = "99" en CFDI (Por definir)
    pagos: list[PagoIn] | None = None
    timbrar_inmediatamente: bool = False  # solo aplica si tipo == FACTURA
    # Retenciones como porcentaje sobre subtotal (ej. 0.16 = 16%).
    # Caso CFE: iva_retenido_pct=0.16 (gobierno retiene IVA completo a PF).
    iva_retenido_pct: float = 0
    isr_retenido_pct: float = 0
    # Observaciones - texto libre que se pasa a Facturama como Observations
    # y aparece en el PDF (no en el XML fiscal). Util para numeros de contrato,
    # ordenes de compra, referencias del cliente, etc.
    observaciones: str | None = None


class ConceptoVentaOut(BaseModel):
    variante_id: int
    descripcion: str
    cantidad: float
    precio_unitario: float
    importe: float


class ConceptoDevolucionIn(BaseModel):
    variante_id: int
    cantidad: float = Field(gt=0)


class DevolucionIn(BaseModel):
    factura_id: int
    conceptos: list[ConceptoDevolucionIn]
    motivo: str | None = None
    timbrar_cfdi_egreso: bool = False


class DocumentoVentaOut(BaseModel):
    id: int
    folio: str
    tipo: str
    estatus: str
    cliente_id: int
    fecha: datetime
    subtotal: float
    iva: float
    total: float
    conceptos: list[ConceptoVentaOut]
    cfdi_uuid: str | None = None

    class Config:
        from_attributes = True
