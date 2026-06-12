-- Tabla para tokens JWT revocados (blacklist para logout seguro)
CREATE TABLE IF NOT EXISTS revoked_tokens (
  id BIGSERIAL PRIMARY KEY,
  jti VARCHAR(64) NOT NULL UNIQUE,
  usuario_id BIGINT REFERENCES usuarios(id) ON DELETE CASCADE,
  revocado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_en TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_jti ON revoked_tokens (jti);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expira ON revoked_tokens (expira_en);

-- Limpiar tokens expirados automáticamente (función de mantenimiento)
-- Se puede invocar periódicamente: SELECT limpiar_tokens_revocados();
CREATE OR REPLACE FUNCTION limpiar_tokens_revocados() RETURNS void AS $$
BEGIN
  DELETE FROM revoked_tokens WHERE expira_en < NOW();
END;
$$ LANGUAGE plpgsql;
