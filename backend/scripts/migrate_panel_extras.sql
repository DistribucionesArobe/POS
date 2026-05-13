-- Agregar columna ingreso_egreso_banco al panel CxP
ALTER TABLE panel_cxp
    ADD COLUMN IF NOT EXISTS ingreso_egreso_banco NUMERIC(14, 2) NOT NULL DEFAULT 0;

-- Moneda + tipo de cambio en CxP (para facturas en USD)
ALTER TABLE cuentas_por_pagar
    ADD COLUMN IF NOT EXISTS moneda VARCHAR(3) NOT NULL DEFAULT 'MXN',
    ADD COLUMN IF NOT EXISTS tipo_cambio NUMERIC(8, 4),
    ADD COLUMN IF NOT EXISTS monto_moneda_original NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS corto_plazo BOOLEAN NOT NULL DEFAULT false;

-- Deudas bancarias (préstamos, créditos, mercancía en tránsito, etc.)
CREATE TABLE IF NOT EXISTS deudas_bancarias (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    nombre VARCHAR(120) NOT NULL,
    referencia VARCHAR(64),
    notas TEXT,
    activa BOOLEAN NOT NULL DEFAULT true,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_deudas_bancarias_empresa ON deudas_bancarias(empresa_id);

CREATE TABLE IF NOT EXISTS conceptos_deuda_bancaria (
    id SERIAL PRIMARY KEY,
    deuda_id INTEGER NOT NULL REFERENCES deudas_bancarias(id) ON DELETE CASCADE,
    concepto VARCHAR(255) NOT NULL,
    monto NUMERIC(14, 2) NOT NULL DEFAULT 0,
    orden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_conceptos_deuda_bancaria_deuda ON conceptos_deuda_bancaria(deuda_id);
