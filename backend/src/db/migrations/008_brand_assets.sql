INSERT INTO system_config (key, value) VALUES
  ('brand_logo_url', ''),
  ('brand_favicon_url', '')
ON CONFLICT (key) DO NOTHING;
