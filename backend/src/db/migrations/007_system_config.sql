CREATE TABLE IF NOT EXISTS system_config (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_config (key, value) VALUES
  ('brand_name', 'InventaPro'),
  ('brand_abbreviation', 'IP'),
  ('brand_subtitle', 'Sistema de Conteo e Inventario'),
  ('brand_color_primary', '#1c4f82'),
  ('brand_color_secondary', '#2864a3')
ON CONFLICT (key) DO NOTHING;
