-- Migracion: tracking de correo + split de pagos
-- Idempotente: usa IF NOT EXISTS

-- 1) Columnas para tracking de envio de correo en CFDIs
ALTER TABLE cfdis
    ADD COLUMN IF NOT EXISTS correo_enviado_a VARCHAR(255),
    ADD COLUMN IF NOT EXISTS correo_enviado_en TIMESTAMP;

-- 2) Tabla de pagos por documento de venta (split entre formas de pago)
CREATE TABLE IF NOT EXISTS pagos_venta (
    id SERIAL PRIMARY KEY,
    documento_venta_id INTEGER NOT NULL REFERENCES documentos_venta(id) ON DELETE CASCADE,
    forma_pago_sat VARCHAR(2) NOT NULL,
    monto NUMERIC(14, 2) NOT NULL,
    referencia VARCHAR(120),
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_pagos_venta_documento ON pagos_venta(documento_venta_id);
