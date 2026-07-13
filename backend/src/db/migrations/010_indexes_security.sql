-- Migración 010: Índices adicionales de rendimiento y seguridad para import_jobs
CREATE INDEX IF NOT EXISTS idx_import_jobs_usuario ON import_jobs (usuario_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_estado ON import_jobs (estado);
CREATE INDEX IF NOT EXISTS idx_import_jobs_creado_en ON import_jobs (creado_en DESC);
