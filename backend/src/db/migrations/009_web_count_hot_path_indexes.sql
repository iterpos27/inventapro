CREATE INDEX IF NOT EXISTS idx_conteos_toma_usuario_estado
  ON conteos (toma_id, usuario_id, estado);

CREATE INDEX IF NOT EXISTS idx_toma_usuarios_usuario_toma_estado
  ON toma_usuarios (usuario_id, toma_id, estado);

CREATE INDEX IF NOT EXISTS idx_tomas_estado_id
  ON tomas_fisicas (estado, id DESC);

CREATE INDEX IF NOT EXISTS idx_app_logs_created_at
  ON app_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs (created_at DESC);
