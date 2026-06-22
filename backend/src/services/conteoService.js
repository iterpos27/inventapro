import { AppError } from '../utils/errors.js';
import { exportConteoExcel } from '../services/excelService.js';
import { pool } from '../db/pool.js';

export async function closeExpiredTomas(db, tomaId = null) {
  const isPool = typeof db.connect === 'function';
  const client = isPool ? await db.connect() : db;

  try {
    if (isPool) {
      await client.query('BEGIN');
    }

    // Adquirir un advisory lock de nivel de transacción para evitar ejecuciones paralelas (ID: 20260622)
    const lockResult = await client.query('SELECT pg_try_advisory_xact_lock(20260622)');
    const hasLock = lockResult.rows[0]?.pg_try_advisory_xact_lock;
    if (!hasLock) {
      // Si otra instancia ya tiene el lock, salimos silenciosamente
      if (isPool) {
        await client.query('ROLLBACK');
      }
      return;
    }

    const params = [];
    let filter = "estado = 'abierta'";
    if (tomaId) {
      params.push(tomaId);
      filter += ` AND id = $${params.length}`;
    }

    // Obtener tomas vencidas para procesarlas
    const expired = await client.query(
      `SELECT id FROM tomas_fisicas
       WHERE ${filter}
         AND fecha_cierre IS NOT NULL
         AND (
           fecha_cierre < CURRENT_DATE
           OR (fecha_cierre = CURRENT_DATE AND hora_fin IS NOT NULL AND hora_fin::time < CURRENT_TIME)
         )
       ORDER BY id`,
      params
    );

    for (const row of expired.rows) {
      const tId = Number(row.id);
      try {
        // Finalizar conteos en borrador que tengan detalle → generar Excel
        const borradores = await client.query(
          `SELECT c.id, c.usuario_id
           FROM conteos c
           INNER JOIN conteo_detalle d ON d.conteo_id = c.id
           WHERE c.toma_id = $1 AND c.estado = 'borrador'
           GROUP BY c.id, c.usuario_id`,
          [tId]
        );

        for (const conteo of borradores.rows) {
          try {
            // Generar Excel si es posible (no bloquea el cierre si falla)
            await exportConteoExcel(Number(conteo.id), { id: conteo.usuario_id, rol: 'usuario' }, client);
          } catch (_) {
            // No crítico: continuar cerrando aunque falle la exportación
          }
          await client.query(
            "UPDATE conteos SET estado = 'finalizado', fecha_finalizacion = COALESCE(fecha_finalizacion, NOW()), updated_at = NOW() WHERE id = $1",
            [conteo.id]
          );
          await client.query(
            "UPDATE toma_usuarios SET estado = 'finalizado' WHERE toma_id = $1 AND usuario_id = $2 AND estado != 'finalizado'",
            [tId, conteo.usuario_id]
          );
        }

        // Cerrar la toma
        await client.query(
          "UPDATE tomas_fisicas SET estado = 'finalizada', fecha_finalizacion = COALESCE(fecha_finalizacion, NOW()) WHERE id = $1 AND estado = 'abierta'",
          [tId]
        );

        // Refrescar resumen
        await refreshTomaSummary(client, tId);

        // Registrar en audit log
        try {
          await client.query(
            "INSERT INTO audit_logs (action, entity, entity_id, details) VALUES ('auto_close', 'toma', $1, $2)",
            [tId, JSON.stringify({ reason: 'expired_window' })]
          );
        } catch (_) { /* No crítico */ }
      } catch (err) {
        // Log del error pero continuar con la siguiente toma
        try {
          await client.query(
            "INSERT INTO app_logs (level, event, message, context) VALUES ('error', 'auto_close_toma_failed', $1, $2)",
            [`No se pudo cerrar toma vencida ${tId}`, JSON.stringify({ toma_id: tId, error: err.message })]
          );
        } catch (_) { /* ignore */ }
      }
    }

    if (isPool) {
      await client.query('COMMIT');
    }
  } catch (error) {
    if (isPool) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (isPool) {
      client.release();
    }
  }
}

export function validateTomaWindow(toma) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Normalizar fecha: puede ser string ISO, string con T, o Date object de pg
  function toDateStr(value) {
    if (!value) return null;
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    return String(value).slice(0, 10);
  }

  const enabled = toDateStr(toma.fecha_habilitacion);
  const closed = toDateStr(toma.fecha_cierre);

  if (enabled && enabled > todayStr) {
    throw new AppError('La toma aun no esta habilitada', 422);
  }

  if (closed) {
    if (closed < todayStr) {
      throw new AppError('La toma ya fue cerrada', 422);
    }
    // Si la fecha de cierre es HOY, verificar también la hora de fin
    if (closed === todayStr && toma.hora_fin) {
      const [hours, minutes] = String(toma.hora_fin).slice(0, 5).split(':').map(Number);
      const closeTime = new Date(now);
      closeTime.setHours(hours, minutes, 0, 0);
      if (now > closeTime) {
        throw new AppError('El horario de la toma ha finalizado', 422);
      }
    }
  }
}

export async function activeDraftForUser(db, conteoId, usuarioId, lock = false) {
  const lockSql = lock ? ' FOR UPDATE' : '';
  const { rows } = await db.query(
    `SELECT c.id, c.toma_id, c.version, t.fecha_habilitacion, t.fecha_cierre, t.hora_inicio, t.hora_fin
     FROM conteos c
     INNER JOIN tomas_fisicas t ON t.id = c.toma_id
     INNER JOIN toma_usuarios tu ON tu.toma_id = c.toma_id AND tu.usuario_id = c.usuario_id
     WHERE c.id = $1
       AND c.usuario_id = $2
       AND c.estado = 'borrador'
       AND t.estado = 'abierta'
       AND tu.estado != 'finalizado'
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
