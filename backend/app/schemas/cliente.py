"""Schemas Pydantic para Cliente."""
from pydantic import BaseModel


class ClienteIn(BaseModel):
    nombre: str | None = None
    rfc: str | None = None
    razon_social: str | None = None
    regimen_fiscal: str | None = None
    codigo_postal: str | None = None
    uso_cfdi_default: str | None = None
    # Nuevos defaults CFDI para pre-llenar al cobrar
    forma_pago_default: str | None = None
    metodo_pago_default: str | None = None  # PUE | PPD
    condiciones_pago: str | None = None
    correo: str | None = None
    telefono: str | None = None
    whatsapp: str | None = None
    direccion: str | None = None
    notas: str | None = None
    dias_credito: int = 0
    limite_credito: float | None = None


class ClienteUpdate(BaseModel):
    nombre: str | None = None
    rfc: str | None = None
    razon_social: str | None = None
    regimen_fiscal: str | None = None
    codigo_postal: str | None = None
    uso_cfdi_default: str | None = None
    forma_pago_default: str | None = None
    metodo_pago_default: str | None = None
    condiciones_pago: str | None = None
    correo: str | None = None
    telefono: str | None = None
    whatsapp: str | None = None
    direccion: str | None = None
    notas: str | None = None
    dias_credito: int | None = None
    limite_credito: float | None = None
    activo: bool | None = None
