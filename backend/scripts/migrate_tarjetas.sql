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

-- Seed con datos del Excel del usuario (solo si esta vacio)
DO $$
DECLARE
    eid INTEGER := 1;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM tarjeta_conceptos WHERE empresa_id = eid) THEN
        -- AMEX NEGOCIOS (suma 9540.70)
        INSERT INTO tarjeta_conceptos (empresa_id, seccion, concepto, monto, orden) VALUES
            (eid, 'amex_negocios', 'walmart',          1084.40, 1),
            (eid, 'amex_negocios', 'walmart',          1650.00, 2),
            (eid, 'amex_negocios', 'city club padel',  1706.30, 3),
            (eid, 'amex_negocios', 'marketing',        5100.00, 4);

        -- AMEX REEMBOLSOS PERSONALES (suma 1259)
        INSERT INTO tarjeta_conceptos (empresa_id, seccion, concepto, monto, orden) VALUES
            (eid, 'amex_reembolsos', 'sams', 1259.00, 1);

        -- BANORTE ACEROMAX (todos los gastos banorte del Excel, suma 150096.46)
        -- El usuario puede mover items a Banorte Padel segun corresponda.
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
END $$;
