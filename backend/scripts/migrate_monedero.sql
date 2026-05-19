-- Monedero: programa de lealtad por puntos

-- Flag por empresa para activar el monedero (solo Aceromax por default)
ALTER TABLE empresas
    ADD COLUMN IF NOT EXISTS monedero_activo BOOLEAN NOT NULL DEFAULT false;

-- Activa el monedero en Aceromax (PF). Ajusta el WHERE si tu empresa Aceromax
-- tiene otro id o nombre.
UPDATE empresas
   SET monedero_activo = true
 WHERE lower(nombre) LIKE '%aceromax%';

-- Tabla de movimientos
CREATE TABLE IF NOT EXISTS monedero_movimientos (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    cliente_id INTEGER NOT NULL REFERENCES clientes(id),
    tipo VARCHAR(20) NOT NULL,
    puntos NUMERIC(14, 2) NOT NULL DEFAULT 0,
    documento_venta_id INTEGER REFERENCES documentos_venta(id),
    notas TEXT,
    fecha TIMESTAMP NOT NULL DEFAULT NOW(),
    vence_en TIMESTAMP,
    usuario_id INTEGER REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS ix_monedero_empresa ON monedero_movimientos(empresa_id);
CREATE INDEX IF NOT EXISTS ix_monedero_cliente ON monedero_movimientos(cliente_id);
CREATE INDEX IF NOT EXISTS ix_monedero_tipo ON monedero_movimientos(tipo);
CREATE INDEX IF NOT EXISTS ix_monedero_fecha ON monedero_movimientos(fecha);

-- Verifica
SELECT id, nombre, monedero_activo FROM empresas;
