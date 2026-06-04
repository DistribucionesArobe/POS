-- Panel CxP: ingreso manual y errores para calcular Venta del mes
ALTER TABLE panel_cxp
    ADD COLUMN IF NOT EXISTS ingreso_mensual NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS errores_mensual NUMERIC(14, 2) NOT NULL DEFAULT 0;
