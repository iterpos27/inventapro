ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_api_tokens_usuario_activo
  ON api_tokens (usuario_id, revocado, fecha_expiracion);
