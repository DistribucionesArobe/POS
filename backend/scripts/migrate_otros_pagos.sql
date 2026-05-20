-- Otros pagos en el Tablero CxP (renta, sueldos, servicios, etc.)
-- Se suman a Facturas por pagar (corto plazo) para el calculo de A vender por dia.

CREATE TABLE IF NOT EXISTS otros_pagos_panel (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    concepto VARCHAR(255) NOT NULL,
    monto NUMERIC(14, 2) NOT NULL DEFAULT 0,
    orden INTEGER NOT NULL DEFAULT 0,
    creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_otros_pagos_empresa ON otros_pagos_panel(empresa_id);
