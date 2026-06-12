CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'supervisor', 'operador', 'reportes', 'usuario');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE toma_estado AS ENUM ('abierta', 'finalizada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE asignacion_estado AS ENUM ('asignado', 'en_proceso', 'finalizado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE conteo_estado AS ENUM ('borrador', 'finalizado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE log_level AS ENUM ('debug', 'info', 'warning', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS usuarios (
  id BIGSERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  usuario VARCHAR(60) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  rol user_role NOT NULL DEFAULT 'usuario',
  estado BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS productos (
  id BIGSERIAL PRIMARY KEY,
  codigo VARCHAR(80) NOT NULL UNIQUE,
  descripcion TEXT NOT NULL,
  estado BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_productos_estado ON productos (estado);
CREATE INDEX IF NOT EXISTS idx_productos_codigo_trgm ON productos USING gin (codigo gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_productos_descripcion_trgm ON productos USING gin (descripcion gin_trgm_ops);

CREATE TABLE IF NOT EXISTS agencias (
  id BIGSERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL UNIQUE,
  estado BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tomas_fisicas (
  id BIGSERIAL PRIMARY KEY,
  numero_toma VARCHAR(20) NOT NULL UNIQUE,
  agencia VARCHAR(120),
  fecha_toma DATE NOT NULL,
  fecha_habilitacion DATE,
  fecha_cierre DATE,
  hora_inicio TIME,
  hora_fin TIME,
  nombre_toma VARCHAR(500) NOT NULL,
  estado toma_estado NOT NULL DEFAULT 'abierta',
  creado_por BIGINT NOT NULL REFERENCES usuarios(id),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_finalizacion TIMESTAMPTZ,
  archivo_excel VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_tomas_estado ON tomas_fisicas (estado);
CREATE INDEX IF NOT EXISTS idx_tomas_fecha ON tomas_fisicas (fecha_toma);

CREATE TABLE IF NOT EXISTS toma_usuarios (
  id BIGSERIAL PRIMARY KEY,
  toma_id BIGINT NOT NULL REFERENCES tomas_fisicas(id) ON DELETE CASCADE,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id),
  estado asignacion_estado NOT NULL DEFAULT 'asignado',
  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (toma_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_toma_usuarios_estado ON toma_usuarios (estado);
CREATE INDEX IF NOT EXISTS idx_toma_usuarios_usuario_estado ON toma_usuarios (usuario_id, estado);

CREATE TABLE IF NOT EXISTS conteos (
  id BIGSERIAL PRIMARY KEY,
  toma_id BIGINT REFERENCES tomas_fisicas(id),
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id),
  nombre_conteo VARCHAR(160) NOT NULL,
  estado conteo_estado NOT NULL DEFAULT 'borrador',
  fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_finalizacion TIMESTAMPTZ,
  archivo_excel VARCHAR(255),
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ,
  UNIQUE (toma_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_conteos_estado ON conteos (estado);
CREATE INDEX IF NOT EXISTS idx_conteos_toma ON conteos (toma_id);
CREATE INDEX IF NOT EXISTS idx_conteos_usuario_estado ON conteos (usuario_id, estado);

CREATE TABLE IF NOT EXISTS conteo_detalle (
  id BIGSERIAL PRIMARY KEY,
  conteo_id BIGINT NOT NULL REFERENCES conteos(id) ON DELETE CASCADE,
  producto_id BIGINT NOT NULL REFERENCES productos(id),
  codigo VARCHAR(80) NOT NULL,
  descripcion TEXT NOT NULL,
  cantidad NUMERIC(12, 2) NOT NULL DEFAULT 0,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conteo_id, producto_id)
);

CREATE INDEX IF NOT EXISTS idx_detalle_conteo ON conteo_detalle (conteo_id);
CREATE INDEX IF NOT EXISTS idx_detalle_codigo ON conteo_detalle (codigo);

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGSERIAL PRIMARY KEY,
  usuario VARCHAR(120) NOT NULL,
  ip VARCHAR(45) NOT NULL,
  intentos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta TIMESTAMPTZ,
  ultimo_intento TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario, ip)
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  dispositivo VARCHAR(120),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_expiracion TIMESTAMPTZ NOT NULL,
  revocado BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_usuario ON api_tokens (usuario_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_expiracion ON api_tokens (fecha_expiracion);

CREATE TABLE IF NOT EXISTS app_logs (
  id BIGSERIAL PRIMARY KEY,
  level log_level NOT NULL DEFAULT 'info',
  event VARCHAR(120) NOT NULL,
  message VARCHAR(1000) NOT NULL,
  context JSONB,
  ip VARCHAR(45),
  usuario_id BIGINT REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT REFERENCES usuarios(id),
  action VARCHAR(80) NOT NULL,
  entity VARCHAR(80) NOT NULL,
  entity_id BIGINT,
  details JSONB,
  ip VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS toma_resumen (
  toma_id BIGINT PRIMARY KEY REFERENCES tomas_fisicas(id) ON DELETE CASCADE,
  usuarios_asignados INTEGER NOT NULL DEFAULT 0,
  usuarios_finalizados INTEGER NOT NULL DEFAULT 0,
  conteos_creados INTEGER NOT NULL DEFAULT 0,
  conteos_con_detalle INTEGER NOT NULL DEFAULT 0,
  unidades_contadas NUMERIC(14, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id),
  archivo VARCHAR(255) NOT NULL,
  nombre_original VARCHAR(255) NOT NULL,
  extension VARCHAR(12) NOT NULL,
  codigo_col INTEGER NOT NULL,
  descripcion_col INTEGER NOT NULL,
  current_row INTEGER NOT NULL DEFAULT 2,
  total_rows INTEGER NOT NULL DEFAULT 0,
  procesados INTEGER NOT NULL DEFAULT 0,
  insertados INTEGER NOT NULL DEFAULT 0,
  actualizados INTEGER NOT NULL DEFAULT 0,
  omitidos INTEGER NOT NULL DEFAULT 0,
  errores INTEGER NOT NULL DEFAULT 0,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  error_message VARCHAR(1000),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ,
  finalizado_en TIMESTAMPTZ
);
