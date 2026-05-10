"""Schemas Pydantic para compras."""
from datetime import datetime
from pydantic import BaseModel, Field


class ConceptoCompraIn(BaseModel):
    variante_id: int
    cantidad: float = Field(gt=0)
    costo_unitario: float = Field(ge=0)
    descripcion: str | None = None


class CompraIn(BaseModel):
    proveedor_id: int
    conceptos: list[ConceptoCompraIn]
    uuid_cfdi: str | None = None
    folio_factura_proveedor: str | None = None
    fecha_factura: datetime | None = None
    con_iva: bool = True
    notas: str | None = None


class AbonoCxPIn(BaseModel):
    cxp_id: int
    monto: float = Field(gt=0)
    forma_pago: str = "TRANSFERENCIA"
    referencia: str | None = None
    notas: str | None = None
