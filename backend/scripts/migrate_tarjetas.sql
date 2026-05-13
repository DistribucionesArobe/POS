-- Tarjetas de credito (control de gastos)
CREATE TABLE IF NOT EXISTS tarjeta_conceptos (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    seccion VARCHAR(32) NOT NULL,
    concepto VARCHAR(255) NOT NULL,
    monto NUMERIC(14, 2) NOT NULL DEFAULT 0,
    orden INTEGER NOT NULL DEFAULT 0,
    creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_tarjeta_empresa ON tarjeta_conceptos(empresa_id);
CREATE INDEX IF NOT EXISTS ix_tarjeta_seccion ON tarjeta_conceptos(seccion);

-- Total de deuda por tarjeta (AMEX, Banorte)
CREATE TABLE IF NOT EXISTS tarjeta_totales (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    tarjeta VARCHAR(32) NOT NULL,
    total_deuda NUMERIC(14, 2) NOT NULL DEFAULT 0,
    actualizado_en TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(empresa_id, tarjeta)
);

CREATE INDEX IF NOT EXISTS ix_tarjeta_totales_empresa ON tarjeta_totales(empresa_id);

-- Migracion de secciones viejas (negocios/reembolsos) -> padel/aceromax
-- "city club padel" se va a amex_padel, todo lo demas a amex_aceromax
UPDATE tarjeta_conceptos
   SET seccion = 'amex_padel'
 WHERE seccion IN ('amex_negocios', 'amex_reembolsos')
   AND lower(concepto) LIKE '%padel%';

UPDATE tarjeta_conceptos
   SET seccion = 'amex_aceromax'
 WHERE seccion IN ('amex_negocios', 'amex_reembolsos');

-- Seed con datos del Excel del usuario (solo si esta vacio)
DO $$
DECLARE
    eid INTEGER := 1;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM tarjeta_conceptos WHERE empresa_id = eid) THEN
        -- AMEX PADEL (suma 1706.30)
        INSERT INTO tarjeta_conceptos (empresa_id, seccion, concepto, monto, orden) VALUES
            (eid, 'amex_padel', 'city club padel', 1706.30, 1);

        -- AMEX ACEROMAX (resto de AMEX: walmart x2, marketing, sams = 9092.40)
        INSERT INTO tarjeta_conceptos (empresa_id, seccion, concepto, monto, orden) VALUES
            (eid, 'amex_aceromax', 'walmart',    1084.40, 1),
            (eid, 'amex_aceromax', 'walmart',    1650.00, 2),
            (eid, 'amex_aceromax', 'marketing',  5100.00, 3),
            (eid, 'amex_aceromax', 'sams',       1259.00, 4);

        -- BANORTE ACEROMAX (todos los gastos banorte, mueve a Padel los que correspondan)
        INSERT INTO tarjeta_conceptos (empresa_id, seccion, concepto, monto, orden) VALUES
            (eid, 'banorte_aceromax', 'liverpool',       4000.00,  1),
            (eid, 'banorte_aceromax', 'motosierras',    21700.00,  2),
            (eid, 'banorte_aceromax', 'plofisa arobe',  92082.73,  3),
            (eid, 'banorte_aceromax', 'toyota',         12686.99,  4),
            (eid, 'banorte_aceromax', 'facturama',         110.00,  5),
            (eid, 'banorte_aceromax', 'facturama',        1650.00,  6),
            (eid, 'banorte_aceromax', 'facebook',         3000.00,  7),
            (eid, 'banorte_aceromax', 'claude',           5000.00,  8),
            (eid, 'banorte_aceromax', 'no se',            4600.00,  9),
            (eid, 'banorte_aceromax', 'google',           1035.93, 10),
            (eid, 'banorte_aceromax', 'google',           3130.81, 11),
            (eid, 'banorte_aceromax', 'gasolina pepe',    1100.00, 12);
    END IF;

    -- Seed de totales (del Excel: AMEX 109000, Banorte se estima en 200000)
    IF NOT EXISTS (SELECT 1 FROM tarjeta_totales WHERE empresa_id = eid) THEN
        INSERT INTO tarjeta_totales (empresa_id, tarjeta, total_deuda) VALUES
            (eid, 'amex',    109000),
            (eid, 'banorte', 181010);
    END IF;
END $$;
