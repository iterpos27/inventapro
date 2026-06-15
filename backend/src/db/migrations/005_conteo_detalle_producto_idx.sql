-- Migración 005: Agregar índice a producto_id en la tabla conteo_detalle
-- Mejora el rendimiento de la consulta del catálogo y reportes con subconsultas correlacionadas

CREATE INDEX IF NOT EXISTS idx_detalle_producto_id ON conteo_detalle(producto_id);
