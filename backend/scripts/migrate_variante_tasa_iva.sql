-- Agregar columna tasa_iva a variantes_producto
-- Default 0.16 (16% general). Marcamos alimentos basicos como 0 luego con
-- UPDATEs manuales o desde la UI (checkbox Sin IVA).
ALTER TABLE variantes_producto
    ADD COLUMN IF NOT EXISTS tasa_iva NUMERIC(6, 4) NOT NULL DEFAULT 0.16;
