"""Schemas Pydantic para clientes."""
from pydantic import BaseModel, Field


class ClienteIn(BaseModel):
    nombre: str
    rfc: str | None = None
    razon_social: str | None = None
    regimen_fiscal: str | None = None
    codigo_postal: str | None = None
    uso_cfdi_default: str | None = None
    correo: str | None = None
    telefono: str | None = None
    whatsapp: str | None = None
    direccion: str | None = None
    limite_credito: float | None = None
    dias_credito: int = 0
    notas: str | None = None


class ClienteUpdate(BaseModel):
    nombre: str | None = None
    rfc: str | None = None
    razon_social: str | None = None
    regimen_fiscal: str | None = None
    codigo_postal: str | None = None
    uso_cfdi_default: str | None = None
    correo: str | None = None
    telefono: str | None = None
    whatsapp: str | None = None
    direccion: str | None = None
    limite_credito: float | None = None
    dias_credito: int | None = None
    notas: str | None = None
    activo: bool | None = None
