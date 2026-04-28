"""Schemas Pydantic para ventas."""
from datetime import datetime
from pydantic import BaseModel, Field


class ConceptoVentaIn(BaseModel):
    variante_id: int
    cantidad: float = Field(gt=0)
    precio_unitario: float = Field(ge=0)
    descuento: float = 0


class DocumentoVentaIn(BaseModel):
    tipo: str  # TICKET | REMISION | FACTURA
    cliente_id: int
    vendedor_id: int | None = None
    forma_pago_sat: str = "01"
    metodo_pago_sat: str = "PUE"
    uso_cfdi: str | None = None
    notas: str | None = None
    conceptos: list[ConceptoVentaIn]
    timbrar_inmediatamente: bool = False  # solo aplica si tipo == FACTURA


class ConceptoVentaOut(BaseModel):
    variante_id: int
    descripcion: str
    cantidad: float
    precio_unitario: float
    importe: float


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
