-- Modulo de costeo de importaciones
-- Multi-tenant, empresa-agnostic. Preparado para poder comercializar.

CREATE TABLE IF NOT EXISTS importaciones (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    folio VARCHAR(30) NOT NULL,
    proveedor VARCHAR(200),
    agente_aduanal VARCHAR(200),
    referencia_pedimento VARCHAR(50),
    contenedor VARCHAR(50),
    puerto_llegada VARCHAR(100),
    fecha TIMESTAMP NOT NULL DEFAULT NOW(),
    fecha_arribo TIMESTAMP,
    moneda_mercancia VARCHAR(3) NOT NULL DEFAULT 'USD',
    tipo_cambio NUMERIC(10,4) NOT NULL DEFAULT 1,
    estatus VARCHAR(20) NOT NULL DEFAULT 'borrador',
    notas TEXT,
    creado_por INTEGER REFERENCES usuarios(id),
    creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_importaciones_empresa_id ON importaciones(empresa_id);

CREATE TABLE IF NOT EXISTS importacion_renglones (
    id SERIAL PRIMARY KEY,
    importacion_id INTEGER NOT NULL REFERENCES importaciones(id) ON DELETE CASCADE,
    orden INTEGER NOT NULL DEFAULT 0,
    descripcion VARCHAR(300) NOT NULL,
    piezas NUMERIC(14,3) NOT NULL DEFAULT 0,
    precio_unit_mercancia NUMERIC(14,4) NOT NULL DEFAULT 0,
    kg_pieza NUMERIC(10,4) NOT NULL DEFAULT 0,
    variante_id INTEGER REFERENCES variantes_producto(id),
    costo_unit_final_mxn NUMERIC(14,4) NOT NULL DEFAULT 0,
    precio_venta_sugerido_mxn NUMERIC(14,4) NOT NULL DEFAULT 0,
    margen_sugerido_pct NUMERIC(6,3) NOT NULL DEFAULT 2.5
);
CREATE INDEX IF NOT EXISTS ix_importacion_renglones_importacion_id
    ON importacion_renglones(importacion_id);

CREATE TABLE IF NOT EXISTS importacion_gastos (
    id SERIAL PRIMARY KEY,
    importacion_id INTEGER NOT NULL REFERENCES importaciones(id) ON DELETE CASCADE,
    orden INTEGER NOT NULL DEFAULT 0,
    concepto VARCHAR(150) NOT NULL,
    categoria VARCHAR(50),
    monto NUMERIC(14,2) NOT NULL DEFAULT 0,
    moneda VARCHAR(3) NOT NULL DEFAULT 'MXN',
    causa_iva BOOLEAN NOT NULL DEFAULT FALSE,
    tasa_iva NUMERIC(6,4) NOT NULL DEFAULT 0.16,
    reembolsable BOOLEAN NOT NULL DEFAULT FALSE,
    notas VARCHAR(300)
);
CREATE INDEX IF NOT EXISTS ix_importacion_gastos_importacion_id
    ON importacion_gastos(importacion_id);

CREATE TABLE IF NOT EXISTS importacion_gastos_default (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    orden INTEGER NOT NULL DEFAULT 0,
    concepto VARCHAR(150) NOT NULL,
    categoria VARCHAR(50),
    monto_referencia NUMERIC(14,2) NOT NULL DEFAULT 0,
    moneda VARCHAR(3) NOT NULL DEFAULT 'MXN',
    causa_iva BOOLEAN NOT NULL DEFAULT FALSE,
    reembolsable BOOLEAN NOT NULL DEFAULT FALSE,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS ix_importacion_gastos_default_empresa_id
    ON importacion_gastos_default(empresa_id);
