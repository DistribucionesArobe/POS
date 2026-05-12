"""Punto de entrada de la aplicacion FastAPI - Aceromax POS."""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (
    auth,
    empresas,
    productos,
    clientes,
    proveedores,
    inventario,
    ventas,
    cxc,
    cxp,
    cfdi,
    reportes,
    whatsapp,
    autofactura,
    cotizaciones,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="Aceromax POS",
    description="Sistema POS multi-empresa, facturacion CFDI 4.0 y asistente Claude",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "env": settings.app_env}


app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(empresas.router, prefix="/api/empresas", tags=["empresas"])
app.include_router(productos.router, prefix="/api/productos", tags=["productos"])
app.include_router(clientes.router, prefix="/api/clientes", tags=["clientes"])
app.include_router(proveedores.router, prefix="/api/proveedores", tags=["proveedores"])
app.include_router(inventario.router, prefix="/api/inventario", tags=["inventario"])
app.include_router(ventas.router, prefix="/api/ventas", tags=["ventas"])
app.include_router(cxc.router, prefix="/api/cxc", tags=["cxc"])
app.include_router(cxp.router, prefix="/api/cxp", tags=["cxp"])
app.include_router(cfdi.router, prefix="/api/cfdi", tags=["cfdi"])
app.include_router(reportes.router, prefix="/api/reportes", tags=["reportes"])
app.include_router(whatsapp.router, prefix="/api/whatsapp", tags=["whatsapp"])
app.include_router(autofactura.router, prefix="/api/public/facturar", tags=["autofactura"])
app.include_router(cotizaciones.router, prefix="/api/cotizaciones", tags=["cotizaciones"])
