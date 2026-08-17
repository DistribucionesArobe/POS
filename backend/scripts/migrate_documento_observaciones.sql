-- Columna observaciones en documentos_venta
-- Se pasa a Facturama Observations y aparece en el PDF del CFDI
-- (no en el XML fiscal). Util para numeros de contrato, ordenes de compra, etc.
ALTER TABLE documentos_venta
    ADD COLUMN IF NOT EXISTS observaciones TEXT;
