import { AppError } from '../utils/errors.js';

export async function closeExpiredTomas(db, tomaId = null) {
  const params = [];
  let filter = "estado = 'abierta'";
  if (tomaId) {
    params.push(tomaId);
    filter += ` AND id = $${params.length}`;
  }
  await db.query(
    `UPDATE tomas_fisicas
     SET estado = 'finalizada', fecha_finalizacion = NOW()
     WHERE ${filter}
       AND fecha_cierre IS NOT NULL
       AND (
         fecha_cierre < CURRENT_DATE
         OR (fecha_cierre = CURRENT_DATE AND hora_fin IS NOT NULL AND hora_fin < CURRENT_TIME)
       )`,
    params
  );
}

export function validateTomaWindow(toma) {
  const today = new Date().toISOString().slice(0, 10);
  const enabled = toma.fecha_habilitacion ? String(toma.fecha_habilitacion).slice(0, 10) : null;
  const closed = toma.fecha_cierre ? String(toma.fecha_cierre).slice(0, 10) : null;
  if (enabled && enabled > today) {
    throw new AppError('La toma aun no esta habilitada', 422);
  }
  if (closed && closed < today) {
    throw new AppError('La toma ya fue cerrada', 422);
  }
}

export async function activeDraftForUser(db, conteoId, usuarioId, lock = false) {
  const lockSql = lock ? ' FOR UPDATE' : '';
  const { rows } = await db.query(
    `SELECT c.id, c.toma_id, c.version, t.fecha_habilitacion, t.fecha_cierre, t.hora_inicio, t.hora_fin
     FROM conteos c
     INNER JOIN tomas_fisicas t ON t.id = c.toma_id
     WHERE c.id = $1 AND c.usuario_id = $2 AND c.estado = 'borrador' AND t.estado = 'abierta'
     ${lockSql}`,
    [conteoId, usuarioId]
  );
  return rows[0] || null;
}

export function assertVersion(conteo, expectedVersion) {
  if (expectedVersion > 0 && Number(conteo.version || 0) !== expectedVersion) {
    throw new AppError('El conteo cambio desde otro dispositivo. Actualice e intente de nuevo.', 409);
  }
}

export async function replaceDetalle(db, conteoId, items) {
  await db.query('DELETE FROM conteo_detalle WHERE conteo_id = $1', [conteoId]);
  return upsertDetalle(db, conteoId, items, []);
}

export async function upsertDetalle(db, conteoId, upsert = [], remove = []) {
  let lineas = 0;
  for (const item of remove) {
    const productoId = Number(item.producto_id || item.id || 0);
    if (productoId > 0) {
      await db.query('DELETE FROM conteo_detalle WHERE conteo_id = $1 AND producto_id = $2', [conteoId, productoId]);
    }
  }

  for (const item of upsert) {
    const productoId = Number(item.producto_id || item.id || 0);
    const cantidad = Number(item.cantidad || 0);
    if (productoId <= 0 || cantidad <= 0) {
      continue;
    }
    const product = await db.query(
      'SELECT id, codigo, descripcion FROM productos WHERE id = $1 AND estado = TRUE LIMIT 1',
      [productoId]
    );
    if (!product.rows[0]) {
      continue;
    }
    await db.query(
      `INSERT INTO conteo_detalle (conteo_id, producto_id, codigo, descripcion, cantidad)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (conteo_id, producto_id)
       DO UPDATE SET cantidad = EXCLUDED.cantidad, codigo = EXCLUDED.codigo, descripcion = EXCLUDED.descripcion`,
      [conteoId, productoId, product.rows[0].codigo, product.rows[0].descripcion, cantidad]
    );
    lineas += 1;
  }
  return lineas;
}

export async function bumpVersion(db, conteoId) {
  const { rows } = await db.query(
    'UPDATE conteos SET version = version + 1, updated_at = NOW() WHERE id = $1 RETURNING version',
    [conteoId]
  );
  return Number(rows[0].version);
}

export async function closeTomaIfComplete(db, tomaId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS asignados,
            COUNT(*) FILTER (WHERE estado = 'finalizado')::int AS finalizados
     FROM toma_usuarios
     WHERE toma_id = $1`,
    [tomaId]
  );
  const row = rows[0];
  if (row.asignados > 0 && row.asignados === row.finalizados) {
    await db.query(
      "UPDATE tomas_fisicas SET estado = 'finalizada', fecha_finalizacion = NOW() WHERE id = $1 AND estado = 'abierta'",
      [tomaId]
    );
  }
}

export async function refreshTomaSummary(db, tomaId) {
  await db.query(
    `INSERT INTO toma_resumen (
       toma_id, usuarios_asignados, usuarios_finalizados, conteos_creados, conteos_con_detalle, unidades_contadas, updated_at
     )
     SELECT t.id,
       COUNT(DISTINCT tu.usuario_id)::int,
       COUNT(DISTINCT tu.usuario_id) FILTER (WHERE tu.estado = 'finalizado')::int,
       COUNT(DISTINCT c.id)::int,
       COUNT(DISTINCT c.id) FILTER (WHERE cd.id IS NOT NULL)::int,
       COALESCE(SUM(cd.cantidad), 0),
       NOW()
     FROM tomas_fisicas t
     LEFT JOIN toma_usuarios tu ON tu.toma_id = t.id
     LEFT JOIN conteos c ON c.toma_id = t.id
     LEFT JOIN conteo_detalle cd ON cd.conteo_id = c.id
     WHERE t.id = $1
     GROUP BY t.id
     ON CONFLICT (toma_id) DO UPDATE SET
       usuarios_asignados = EXCLUDED.usuarios_asignados,
       usuarios_finalizados = EXCLUDED.usuarios_finalizados,
       conteos_creados = EXCLUDED.conteos_creados,
       conteos_con_detalle = EXCLUDED.conteos_con_detalle,
       unidades_contadas = EXCLUDED.unidades_contadas,
       updated_at = NOW()`,
    [tomaId]
  );
}

