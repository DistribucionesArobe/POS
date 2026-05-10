"""Schemas Pydantic para proveedores."""
from pydantic import BaseModel


class ProveedorIn(BaseModel):
    nombre: str
    rfc: str | None = None
    razon_social: str | None = None
    correo: str | None = None
    telefono: str | None = None
    direccion: str | None = None
    dias_credito: int = 0


class ProveedorUpdate(BaseModel):
    nombre: str | None = None
    rfc: str | None = None
    razon_social: str | None = None
    correo: str | None = None
    telefono: str | None = None
    direccion: str | None = None
    dias_credito: int | None = None
    activo: bool | None = None
