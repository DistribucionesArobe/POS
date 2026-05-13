-- Subcuentas dentro de cada tarjeta (Infinite + Platinum para Banorte, etc).
-- TOTAL DEUDA en el header = SUM(monto) de subcuentas de esa tarjeta.

CREATE TABLE IF NOT EXISTS tarjeta_subcuentas (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    tarjeta VARCHAR(32) NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    monto NUMERIC(14, 2) NOT NULL DEFAULT 0,
    orden INTEGER NOT NULL DEFAULT 0,
    creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_tarjeta_subcuentas_empresa ON tarjeta_subcuentas(empresa_id);
CREATE INDEX IF NOT EXISTS ix_tarjeta_subcuentas_tarjeta ON tarjeta_subcuentas(tarjeta);

-- Seed inicial (solo si no hay subcuentas)
INSERT INTO tarjeta_subcuentas (empresa_id, tarjeta, nombre, monto, orden)
SELECT * FROM (VALUES
    (1, 'amex',    'AMEX',           109000.00, 1),
    (1, 'banorte', 'Infinite 4682',  170673.00, 1),
    (1, 'banorte', 'Platinum 1269',   10337.00, 2)
) AS v(empresa_id, tarjeta, nombre, monto, orden)
WHERE NOT EXISTS (SELECT 1 FROM tarjeta_subcuentas WHERE empresa_id = 1);

-- Verifica
SELECT tarjeta, nombre, monto FROM tarjeta_subcuentas ORDER BY tarjeta, orden;
