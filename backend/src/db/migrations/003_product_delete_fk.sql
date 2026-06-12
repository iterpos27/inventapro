ALTER TABLE conteo_detalle
  ALTER COLUMN producto_id DROP NOT NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT tc.constraint_name
    INTO constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name = 'conteo_detalle'
    AND kcu.column_name = 'producto_id'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE conteo_detalle DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE conteo_detalle
  ADD CONSTRAINT conteo_detalle_producto_id_fkey
  FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE SET NULL;
