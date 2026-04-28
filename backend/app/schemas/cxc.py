"""Schemas para CxC."""
from pydantic import BaseModel, Field


class AbonoCxCIn(BaseModel):
    cxc_id: int
    monto: float = Field(gt=0)
    forma_pago: str
    referencia: str | None = None
    origen: str = "MANUAL"  # MANUAL | WHATSAPP_FOTO
    notas: str | None = None
    emitir_complemento_pago: bool = False  # auto si la factura es PPD
