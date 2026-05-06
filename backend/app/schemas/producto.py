"""Schemas Pydantic para productos y variantes."""
from pydantic import BaseModel, Field


class ProductoIn(BaseModel):
    nombre: str
    descripcion: str | None = None
    categoria: str | None = None
    marca: str | None = None
    clave_prod_serv_sat: str | None = None


class ProductoSimpleIn(BaseModel):
    """Crea producto + 1 variante en un solo paso (caso comun)."""
    nombre: str
    categoria: str | None = None
    marca: str | None = None
    clave_prod_serv_sat: str | None = None
    sku: str
    presentacion: str = "Default"
    unidad: str = "PZA"
    clave_unidad_sat: str = "H87"
    precio_publico: float = 0
    costo_promedio: float = 0
    stock_minimo: float = 0


class VarianteIn(BaseModel):
    producto_id: int
    sku: str
    presentacion: str
    unidad: str = "PZA"
    clave_unidad_sat: str = "H87"
    precio_publico: float = 0
    precio_mayoreo: float | None = None
    cantidad_mayoreo: int = 0
    costo_promedio: float = 0
    stock_minimo: float = 0
    factor_division: int = 1


class PrecioUpdate(BaseModel):
    precio_publico: float = Field(ge=0)
    precio_mayoreo: float | None = None
