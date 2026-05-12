-- Migracion: tabla cortes_caja
CREATE TABLE IF NOT EXISTS cortes_caja (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    usuario_id INTEGER REFERENCES usuarios(id),
    fecha_corte TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_desde TIMESTAMP NOT NULL,
    fecha_hasta TIMESTAMP NOT NULL,
    n_ventas INTEGER NOT NULL DEFAULT 0,
    total_vendido NUMERIC(14, 2) NOT NULL DEFAULT 0,
    desglose_pagos JSONB NOT NULL DEFAULT '{}',
    efectivo_esperado NUMERIC(14, 2) NOT NULL DEFAULT 0,
    efectivo_real NUMERIC(14, 2) NOT NULL DEFAULT 0,
    diferencia NUMERIC(14, 2) NOT NULL DEFAULT 0,
    notas TEXT,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_cortes_caja_empresa ON cortes_caja(empresa_id);
CREATE INDEX IF NOT EXISTS ix_cortes_caja_usuario ON cortes_caja(usuario_id);
CREATE INDEX IF NOT EXISTS ix_cortes_caja_fecha   ON cortes_caja(fecha_corte);
