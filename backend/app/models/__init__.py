"""Modelos de dominio - importarlos aqui para que alembic los descubra."""
from app.models.usuario import Usuario  # noqa
from app.models.cliente import Cliente  # noqa
from app.models.proveedor import Proveedor  # noqa
from app.models.producto import Producto, VarianteProducto  # noqa
from app.models.kardex import MovimientoInventario  # noqa
from app.models.venta import DocumentoVenta, ConceptoVenta  # noqa
from app.models.cxc import CuentaPorCobrar, AbonoCxC  # noqa
from app.models.cxp import CuentaPorPagar, AbonoCxP, Compra, ConceptoCompra  # noqa
from app.models.cfdi import Cfdi, ComplementoPago  # noqa
from app.models.cotizacion import Cotizacion  # noqa
