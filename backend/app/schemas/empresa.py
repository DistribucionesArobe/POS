"""Schemas Pydantic para empresas."""
from pydantic import BaseModel


class EmpresaIn(BaseModel):
    nombre: str
    rfc: str
    razon_social: str
    regimen_fiscal: str
    codigo_postal: str
    facturama_user: str | None = None
    facturama_password: str | None = None
    facturama_api_url: str = "https://apisandbox.facturama.com.mx"


class EmpresaUpdate(BaseModel):
    nombre: str | None = None
    razon_social: str | None = None
    regimen_fiscal: str | None = None
    codigo_postal: str | None = None
    facturama_user: str | None = None
    facturama_password: str | None = None
    facturama_api_url: str | None = None
    activa: bool | None = None
