ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS marca VARCHAR(120) NOT NULL DEFAULT '';

ALTER TABLE conteo_detalle
  ADD COLUMN IF NOT EXISTS marca VARCHAR(120) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_productos_marca_trgm ON productos USING gin (marca gin_trgm_ops);
