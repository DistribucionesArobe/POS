-- Retenciones en documentos de venta (caso CFE / gobierno comprando a PF)
ALTER TABLE documentos_venta
    ADD COLUMN IF NOT EXISTS iva_retenido NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS isr_retenido NUMERIC(14, 2) NOT NULL DEFAULT 0;
