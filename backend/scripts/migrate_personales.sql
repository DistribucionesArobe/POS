-- Control de gastos personales mensuales
CREATE TABLE IF NOT EXISTS gastos_personales (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    dia INTEGER,
    tipo VARCHAR(64),
    concepto VARCHAR(255),
    monto NUMERIC(14, 2) NOT NULL DEFAULT 0,
    orden INTEGER NOT NULL DEFAULT 0,
    creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_gastos_personales_empresa ON gastos_personales(empresa_id);

CREATE TABLE IF NOT EXISTS ingresos_personales (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    fuente VARCHAR(120) NOT NULL,
    monto NUMERIC(14, 2) NOT NULL DEFAULT 0,
    orden INTEGER NOT NULL DEFAULT 0,
    creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_ingresos_personales_empresa ON ingresos_personales(empresa_id);

-- Seed inicial desde tu Excel
INSERT INTO gastos_personales (empresa_id, dia, tipo, concepto, monto, orden)
SELECT * FROM (VALUES
    (1, 15, 'Banorte', NULL, 32771.00, 1),
    (1, 15, 'Amex',    NULL, 11802.00, 2),
    (1, 30, 'Banorte', NULL,     0.00, 3),
    (1, 30, 'Amex',    NULL,     0.00, 4)
) AS v(empresa_id, dia, tipo, concepto, monto, orden)
WHERE NOT EXISTS (SELECT 1 FROM gastos_personales WHERE empresa_id = 1);

INSERT INTO ingresos_personales (empresa_id, fuente, monto, orden)
SELECT 1, 'Sueldo', 125000.00, 1
WHERE NOT EXISTS (SELECT 1 FROM ingresos_personales WHERE empresa_id = 1);

SELECT 'gastos' AS t, COUNT(*) FROM gastos_personales
UNION ALL SELECT 'ingresos', COUNT(*) FROM ingresos_personales;
