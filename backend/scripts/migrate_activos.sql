-- Activos de la empresa: vehiculos, tarjetas de gasolina, cuentas de servicios.
CREATE TABLE IF NOT EXISTS activos (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    categoria VARCHAR(32) NOT NULL,
    col1 VARCHAR(255),
    col2 VARCHAR(255),
    col3 VARCHAR(255),
    orden INTEGER NOT NULL DEFAULT 0,
    creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_activos_empresa ON activos(empresa_id);
CREATE INDEX IF NOT EXISTS ix_activos_categoria ON activos(categoria);

-- Seed (solo si no hay filas para la empresa 1 - ajusta empresa_id si necesario)
DO $$
DECLARE
    eid INTEGER := 1;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM activos WHERE empresa_id = eid) THEN
        INSERT INTO activos (empresa_id, categoria, col1, col2, col3, orden) VALUES
            (eid, 'vehiculo', 'Tacoma', 'WG6291C', '36398', 1),
            (eid, 'vehiculo', 'H100',   'WG5175C', '00956', 2),
            (eid, 'vehiculo', 'Ranger', 'WG5174C', '34744', 3),
            (eid, 'vehiculo', 'CRV',    'XMK314D', '08453', 4),
            (eid, 'gasolina', 'JORGE',   '2618', NULL, 1),
            (eid, 'gasolina', 'GABY',    '1107', NULL, 2),
            (eid, 'gasolina', 'NEGOCIO', '2779', NULL, 3),
            (eid, 'gasolina', 'BETY',    '1405', NULL, 4),
            (eid, 'comapa',   'agua casa',     '688167', NULL, 1),
            (eid, 'comapa',   'agua aceromax', '711813', NULL, 2),
            (eid, 'comapa',   'agua padel',    '770518', NULL, 3);
    END IF;
END $$;
