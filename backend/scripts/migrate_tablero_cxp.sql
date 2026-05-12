-- Migracion: tablero CxP mensual + CxP manuales

-- 1) Permitir CxP manual (sin compra) y agregar campos del Excel
ALTER TABLE cuentas_por_pagar
    ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id),
    ADD COLUMN IF NOT EXISTS folio_factura VARCHAR(64),
    ADD COLUMN IF NOT EXISTS fecha_recepcion TIMESTAMP,
    ADD COLUMN IF NOT EXISTS observaciones TEXT,
    ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE cuentas_por_pagar ALTER COLUMN compra_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS ix_cxp_folio_factura ON cuentas_por_pagar(folio_factura);
CREATE INDEX IF NOT EXISTS ix_cxp_empresa ON cuentas_por_pagar(empresa_id);

-- 2) Tabla del tablero (KPIs editables por mes)
CREATE TABLE IF NOT EXISTS panel_cxp (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    anio INTEGER NOT NULL,
    mes INTEGER NOT NULL,
    venta_objetivo_mes NUMERIC(14, 2) NOT NULL DEFAULT 0,
    saldo_banco NUMERIC(14, 2) NOT NULL DEFAULT 0,
    usd_mxn NUMERIC(8, 4) NOT NULL DEFAULT 0,
    notas TEXT,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (empresa_id, anio, mes)
);

CREATE INDEX IF NOT EXISTS ix_panel_cxp_empresa ON panel_cxp(empresa_id);

-- 3) Backfill: poner empresa_id a CxP existentes usando la compra
UPDATE cuentas_por_pagar cp
SET empresa_id = c.empresa_id
FROM compras c
WHERE cp.compra_id = c.id AND cp.empresa_id IS NULL;
