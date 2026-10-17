-- Marcar variantes para aparecer en el sitio publico (ej. somoscpv.com)
ALTER TABLE variantes_producto
  ADD COLUMN IF NOT EXISTS mostrar_en_web BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE variantes_producto
  ADD COLUMN IF NOT EXISTS imagen_url VARCHAR(500);

CREATE INDEX IF NOT EXISTS ix_variantes_producto_mostrar_en_web
  ON variantes_producto (mostrar_en_web);
