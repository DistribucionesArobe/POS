-- Favoritos para botones rapidos en caja
ALTER TABLE variantes_producto
    ADD COLUMN IF NOT EXISTS favorito_caja BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ix_variantes_favorito ON variantes_producto(favorito_caja) WHERE favorito_caja = true;
