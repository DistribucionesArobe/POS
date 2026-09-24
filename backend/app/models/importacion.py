"""Modulo de costeo de importaciones.

Diseno multi-tenant desde el arranque para poder comercializarlo:
- Empresa-agnostic (nada hardcoded a Aceromax/Arobe)
- Multi-moneda (mercancia puede venir en USD/EUR/CNY)
- Gastos configurables con catalogo default por empresa
- Distincion IVA/no-IVA y reembolsable/no-reembolsable
- Preparado para pegar a variantes del catalogo POS (aplicar costo real)
"""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Numeric, DateTime, ForeignKey, Boolean, Text,
)
from sqlalchemy.orm import relationship

from app.db import Base


class Importacion(Base):
    __tablename__ = "importaciones"

    id = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    folio = Column(String(30), nullable=False)  # ej: IMP-2026-0001
    proveedor = Column(String(200))  # fabrica / trading company origen
    agente_aduanal = Column(String(200))  # LDP Logistics, etc.
    referencia_pedimento = Column(String(50))  # numero de pedimento (opcional)
    contenedor = Column(String(50))  # "1x40 HC", "1x20", "LCL 6 CBM"
    puerto_llegada = Column(String(100))  # Manzanillo, Lazaro Cardenas
    fecha = Column(DateTime, default=datetime.utcnow, nullable=False)
    fecha_arribo = Column(DateTime)  # ETA
    moneda_mercancia = Column(String(3), nullable=False, default="USD")  # USD/EUR/CNY/MXN
    tipo_cambio = Column(Numeric(10, 4), nullable=False, default=1)  # a MXN
    estatus = Column(String(20), nullable=False, default="borrador")
    # borrador / en_transito / recibida / cerrada / cancelada
    notas = Column(Text)
    creado_por = Column(Integer, ForeignKey("usuarios.id"))
    creado_en = Column(DateTime, default=datetime.utcnow, nullable=False)

    renglones = relationship(
        "ImportacionRenglon", back_populates="importacion",
        cascade="all, delete-orphan", order_by="ImportacionRenglon.orden",
    )
    gastos = relationship(
        "ImportacionGasto", back_populates="importacion",
        cascade="all, delete-orphan", order_by="ImportacionGasto.orden",
    )


class ImportacionRenglon(Base):
    """Cada linea de mercancia dentro de la importacion."""
    __tablename__ = "importacion_renglones"

    id = Column(Integer, primary_key=True)
    importacion_id = Column(
        Integer, ForeignKey("importaciones.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    orden = Column(Integer, nullable=False, default=0)
    descripcion = Column(String(300), nullable=False)
    piezas = Column(Numeric(14, 3), nullable=False, default=0)
    precio_unit_mercancia = Column(Numeric(14, 4), nullable=False, default=0)  # en moneda origen
    kg_pieza = Column(Numeric(10, 4), nullable=False, default=0)
    # Link opcional a variante del POS para aplicar costo despues
    variante_id = Column(Integer, ForeignKey("variantes_producto.id"), nullable=True)
    # Cache de calculos (se recalcula en cada guardado, sirve para reportes)
    costo_unit_final_mxn = Column(Numeric(14, 4), nullable=False, default=0)
    precio_venta_sugerido_mxn = Column(Numeric(14, 4), nullable=False, default=0)
    margen_sugerido_pct = Column(Numeric(6, 3), nullable=False, default=2.5)  # 2.5x default

    importacion = relationship("Importacion", back_populates="renglones")


class ImportacionGasto(Base):
    """Cada gasto/impuesto/servicio del proceso de importacion."""
    __tablename__ = "importacion_gastos"

    id = Column(Integer, primary_key=True)
    importacion_id = Column(
        Integer, ForeignKey("importaciones.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    orden = Column(Integer, nullable=False, default=0)
    concepto = Column(String(150), nullable=False)  # "Flete maritimo", "IGI", etc.
    categoria = Column(String(50))
    # flete / seguro / impuesto / agente / maniobra / otro
    monto = Column(Numeric(14, 2), nullable=False, default=0)
    moneda = Column(String(3), nullable=False, default="MXN")
    causa_iva = Column(Boolean, nullable=False, default=False)
    tasa_iva = Column(Numeric(6, 4), nullable=False, default=0.16)
    reembolsable = Column(Boolean, nullable=False, default=False)
    # ej: garantia de contenedor - no debe sumarse al costo prorrateado
    notas = Column(String(300))
    # Formula auto-calculada. Opciones:
    #  iva_valor_aduana  -> 16% (mercancia_mxn + flete_maritimo)
    #  dta_valor_aduana  -> 0.008 * (mercancia_mxn + flete_maritimo)
    #  padron_5pct       -> 0.05 * (mercancia_mxn + flete_maritimo)
    # None = monto manual editable
    formula = Column(String(50), nullable=True)

    importacion = relationship("Importacion", back_populates="gastos")


class ImportacionGastoDefault(Base):
    """Catalogo de gastos default por empresa. Se precarga al crear nueva importacion.
    El usuario puede editarlos, agregar o quitar. Los ultimos usados se guardan aqui
    con el monto de referencia para reusar."""
    __tablename__ = "importacion_gastos_default"

    id = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    orden = Column(Integer, nullable=False, default=0)
    concepto = Column(String(150), nullable=False)
    categoria = Column(String(50))
    monto_referencia = Column(Numeric(14, 2), nullable=False, default=0)
    moneda = Column(String(3), nullable=False, default="MXN")
    causa_iva = Column(Boolean, nullable=False, default=False)
    reembolsable = Column(Boolean, nullable=False, default=False)
    activo = Column(Boolean, nullable=False, default=True)
    formula = Column(String(50), nullable=True)  # ver ImportacionGasto.formula
