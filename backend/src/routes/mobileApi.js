import bcrypt from 'bcryptjs';
import express from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { requireApiUser } from '../middleware/auth.js';
import { exportConteoExcel } from '../services/excelService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/errors.js';
import { randomToken, sha256 } from '../utils/hash.js';
import {
  activeDraftForUser,
  assertVersion,
  bumpVersion,
  closeExpiredTomas,
  closeTomaIfComplete,
  refreshTomaSummary,
  replaceDetalle,
  upsertDetalle,
  validateTomaWindow
} from '../services/conteoService.js';

export const mobileApi = express.Router();

mobileApi.post('/login', asyncHandler(async (req, res) => {
  const usuario = String(req.body.usuario || '').trim();
  const password = String(req.body.password || '');
  const device = String(req.body.device || 'Flutter Android').slice(0, 120);
  const ip = req.ip || '0.0.0.0';

  if (!usuario || !password) {
    throw new AppError('Ingrese usuario y contrasena', 422);
  }

  const attempt = await pool.query('SELECT intentos, bloqueado_hasta FROM login_attempts WHERE usuario = $1 AND ip = $2', [usuario, ip]);
  if (attempt.rows[0]?.bloqueado_hasta && new Date(attempt.rows[0].bloqueado_hasta) > new Date()) {
    throw new AppError('Demasiados intentos. Espere 15 minutos.', 429);
  }

  const userResult = await pool.query(
    'SELECT id, nombre, usuario, password, rol FROM usuarios WHERE usuario = $1 AND estado = TRUE LIMIT 1',
    [usuario]
  );
  const user = userResult.rows[0];
  const validPassword = user ? await bcrypt.compare(password, user.password) : false;
  if (!user || !validPassword) {
    await pool.query(
      `INSERT INTO login_attempts (usuario, ip, intentos, ultimo_intento)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (usuario, ip)
       DO UPDATE SET
         intentos = login_attempts.intentos + 1,
         bloqueado_hasta = CASE WHEN login_attempts.intentos + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE login_attempts.bloqueado_hasta END,
         ultimo_intento = NOW()`,
      [usuario, ip]
    );
    throw new AppError('Usuario o contrasena incorrectos', 401);
  }

  if (user.rol !== 'usuario' && user.rol !== 'operador') {
    throw new AppError('La app movil es solo para usuarios de conteo', 403);
  }

  const token = randomToken();
  await pool.query(
    `INSERT INTO api_tokens (usuario_id, token_hash, dispositivo, fecha_expiracion)
     VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')`,
    [user.id, sha256(token), device]
  );
  await pool.query('DELETE FROM login_attempts WHERE usuario = $1 AND ip = $2', [usuario, ip]);

  res.json({
    ok: true,
    token,
    user: { id: Number(user.id), nombre: user.nombre, usuario: user.usuario, rol: user.rol }
  });
}));

mobileApi.post('/logout', asyncHandler(async (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (token) {
    await pool.query('UPDATE api_tokens SET revocado = TRUE WHERE token_hash = $1', [sha256(token)]);
  }
  res.json({ ok: true });
}));

mobileApi.get('/tomas', requireApiUser, asyncHandler(async (req, res) => {
  closeExpiredTomas(pool).catch((err) => {
    console.error('Error en segundo plano al cerrar tomas vencidas (mobileApi):', err);
  });
  const { rows } = await pool.query(
    `SELECT t.id AS toma_id, t.numero_toma, t.nombre_toma, t.agencia, t.estado AS toma_estado,
            t.fecha_habilitacion, t.fecha_cierre, t.hora_inicio, t.hora_fin,
            tu.estado AS asignacion_estado,
            c.id AS conteo_id, c.estado AS conteo_estado, c.fecha_inicio, c.fecha_finalizacion,
            COALESCE(COUNT(cd.id), 0)::int AS lineas
     FROM toma_usuarios tu
     INNER JOIN tomas_fisicas t ON t.id = tu.toma_id
     LEFT JOIN conteos c ON c.toma_id = tu.toma_id AND c.usuario_id = tu.usuario_id
     LEFT JOIN conteo_detalle cd ON cd.conteo_id = c.id
     WHERE tu.usuario_id = $1 AND t.estado = 'abierta' AND tu.estado != 'finalizado'
     GROUP BY t.id, tu.estado, c.id
     ORDER BY t.id DESC`,
    [req.user.id]
  );
  res.json({ ok: true, tomas: rows });
}));

mobileApi.post('/iniciar_conteo', requireApiUser, asyncHandler(async (req, res) => {
  const tomaId = Number(req.body.toma_id || 0);
  if (tomaId <= 0) {
    throw new AppError('Toma invalida', 422);
  }

  const conteoId = await withTransaction(async (db) => {
    await closeExpiredTomas(db, tomaId);
    const tomaResult = await db.query(
      `SELECT t.id, t.nombre_toma, t.fecha_habilitacion, t.fecha_cierre, t.hora_inicio, t.hora_fin
       FROM tomas_fisicas t
       INNER JOIN toma_usuarios tu ON tu.toma_id = t.id
       WHERE t.id = $1 AND tu.usuario_id = $2 AND t.estado = 'abierta' AND tu.estado != 'finalizado'
       FOR UPDATE`,
      [tomaId, req.user.id]
    );
    const toma = tomaResult.rows[0];
    if (!toma) {
      throw new AppError('Toma no disponible', 422);
    }
    validateTomaWindow(toma);

    const current = await db.query('SELECT id, estado FROM conteos WHERE toma_id = $1 AND usuario_id = $2 LIMIT 1', [tomaId, req.user.id]);
    if (current.rows[0] && current.rows[0].estado !== 'borrador') {
      throw new AppError('Conteo no disponible', 422);
    }
    let id = current.rows[0]?.id;
    if (!id) {
      const created = await db.query(
        "INSERT INTO conteos (toma_id, usuario_id, nombre_conteo, estado, fecha_inicio) VALUES ($1, $2, $3, 'borrador', NOW()) RETURNING id",
        [tomaId, req.user.id, toma.nombre_toma]
      );
      id = created.rows[0].id;
    }
    await db.query("UPDATE toma_usuarios SET estado = 'en_proceso' WHERE toma_id = $1 AND usuario_id = $2 AND estado = 'asignado'", [tomaId, req.user.id]);
    return id;
  });

  res.json({ ok: true, conteo_id: Number(conteoId) });
}));

mobileApi.get('/detalle_conteo', requireApiUser, asyncHandler(async (req, res) => {
  const conteoId = Number(req.query.conteo_id || 0);
  if (conteoId <= 0) {
    throw new AppError('Conteo invalido', 422);
  }
  const conteo = await pool.query(
    `SELECT c.id, c.version
     FROM conteos c
     INNER JOIN tomas_fisicas t ON t.id = c.toma_id
     INNER JOIN toma_usuarios tu ON tu.toma_id = c.toma_id AND tu.usuario_id = c.usuario_id
     WHERE c.id = $1
       AND c.usuario_id = $2
       AND c.estado = 'borrador'
       AND t.estado = 'abierta'
       AND tu.estado != 'finalizado'
     LIMIT 1`,
    [conteoId, req.user.id]
  );
  if (!conteo.rows[0]) {
    throw new AppError('Conteo no disponible', 404);
  }
  const items = await pool.query('SELECT producto_id, codigo, descripcion, cantidad FROM conteo_detalle WHERE conteo_id = $1 ORDER BY id', [conteoId]);
  res.json({ ok: true, conteo_version: Number(conteo.rows[0].version), items: items.rows });
}));

mobileApi.get('/productos', requireApiUser, asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) {
    res.json({ ok: true, productos: [] });
    return;
  }
  const { rows } = await pool.query(
    `SELECT id, codigo, descripcion
     FROM productos
     WHERE estado = TRUE AND (codigo ILIKE $1 OR descripcion ILIKE $2)
     ORDER BY CASE WHEN codigo = $3 THEN 0 ELSE 1 END, descripcion, codigo
     LIMIT 30`,
    [`${q}%`, `%${q}%`, q]
  );
  res.json({ ok: true, productos: rows });
}));

mobileApi.post('/guardar_borrador', requireApiUser, asyncHandler(async (req, res) => {
  const conteoId = Number(req.body.conteo_id || 0);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const expectedVersion = Number(req.body.conteo_version || 0);
  if (conteoId <= 0 || items.length === 0) {
    throw new AppError('Datos incompletos', 422);
  }
  const result = await saveConteo(req.user.id, conteoId, expectedVersion, items, [], true);
  res.json(result);
}));

mobileApi.post('/guardar_cambios', requireApiUser, asyncHandler(async (req, res) => {
  const conteoId = Number(req.body.conteo_id || 0);
  const upsert = Array.isArray(req.body.upsert) ? req.body.upsert : [];
  const remove = Array.isArray(req.body.remove) ? req.body.remove : [];
  const expectedVersion = Number(req.body.conteo_version || 0);
  if (conteoId <= 0) {
    throw new AppError('Conteo requerido', 422);
  }
  if (upsert.length === 0 && remove.length === 0) {
    throw new AppError('Sin cambios para guardar', 422);
  }
  const result = await saveConteo(req.user.id, conteoId, expectedVersion, upsert, remove, false);
  res.json({ ...result, message: 'Cambios guardados' });
}));

mobileApi.post('/finalizar_conteo', requireApiUser, asyncHandler(async (req, res) => {
  const conteoId = Number(req.body.conteo_id || 0);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const expectedVersion = Number(req.body.conteo_version || 0);
  if (conteoId <= 0 || items.length === 0) {
    throw new AppError('Datos incompletos', 422);
  }

  const response = await withTransaction(async (db) => {
    const conteo = await activeDraftForUser(db, conteoId, req.user.id, true);
    if (!conteo) {
      throw new AppError('Conteo no disponible', 422);
    }
    validateTomaWindow(conteo);
    assertVersion(conteo, expectedVersion);
    await db.query('SELECT id FROM tomas_fisicas WHERE id = $1 FOR UPDATE', [conteo.toma_id]);
    const lineas = await replaceDetalle(db, conteoId, items);
    if (lineas === 0) {
      throw new AppError('Sin productos validos', 422);
    }
    const version = await bumpVersion(db, conteoId);
    await db.query(
      "UPDATE conteos SET estado = 'finalizado', fecha_finalizacion = NOW(), archivo_excel = NULL, updated_at = NOW() WHERE id = $1",
      [conteoId]
    );
    await db.query("UPDATE toma_usuarios SET estado = 'finalizado' WHERE toma_id = $1 AND usuario_id = $2", [conteo.toma_id, req.user.id]);
    await db.query('UPDATE tomas_fisicas SET archivo_excel = NULL WHERE id = $1', [conteo.toma_id]);
    await closeTomaIfComplete(db, conteo.toma_id);
    await refreshTomaSummary(db, conteo.toma_id);
    return { ok: true, conteo_id: conteoId, conteo_version: version, download_url: `/api/v1/conteos/${conteoId}/excel` };
  });
  res.json(response);
}));

mobileApi.get('/conteos/:id/excel', requireApiUser, asyncHandler(async (req, res) => {
  const conteoId = Number(req.params.id || 0);
  if (conteoId <= 0) {
    throw new AppError('Conteo invalido', 422);
  }
  const file = await exportConteoExcel(conteoId, req.user);
  res.download(file.fullPath, file.filename);
}));

async function saveConteo(userId, conteoId, expectedVersion, upsert, remove, replace) {
  return withTransaction(async (db) => {
    const conteo = await activeDraftForUser(db, conteoId, userId, true);
    if (!conteo) {
      throw new AppError('Conteo no disponible', 422);
    }
    validateTomaWindow(conteo);
    assertVersion(conteo, expectedVersion);
    const lineas = replace
      ? await replaceDetalle(db, conteoId, upsert)
      : await upsertDetalle(db, conteoId, upsert, remove);
    if (replace && lineas === 0) {
      throw new AppError('Sin productos validos', 422);
    }
    const version = await bumpVersion(db, conteoId);
    return { ok: true, conteo_id: conteoId, conteo_version: version, lineas };
  });
}
