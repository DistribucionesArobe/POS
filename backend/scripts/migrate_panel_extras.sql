-- Agregar columna ingreso_egreso_banco al panel CxP
ALTER TABLE panel_cxp
    ADD COLUMN IF NOT EXISTS ingreso_egreso_banco NUMERIC(14, 2) NOT NULL DEFAULT 0;

-- Moneda + tipo de cambio en CxP (para facturas en USD)
ALTER TABLE cuentas_por_pagar
    ADD COLUMN IF NOT EXISTS moneda VARCHAR(3) NOT NULL DEFAULT 'MXN',
    ADD COLUMN IF NOT EXISTS tipo_cambio NUMERIC(8, 4),
    ADD COLUMN IF NOT EXISTS monto_moneda_original NUMERIC(14, 2);
