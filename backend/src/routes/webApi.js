import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { config } from '../config.js';
import { pool, withTransaction } from '../db/pool.js';
import { requirePermission, requireWebUser } from '../middleware/auth.js';
import {
  exportConteoExcel,
  generateConsolidadoExcel,
  importProductsFromFile,
  importStorageDir,
  ensureStorage
} from '../services/excelService.js';
import {
  activeDraftForUser,
  assertVersion,
  bumpVersion,
  closeExpiredTomas,
  closeTomaIfComplete,
  refreshTomaSummary,
  replaceDetalle,
  validateTomaWindow
} from '../services/conteoService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/errors.js';

export const webApi = express.Router();
await ensureStorage();
const upload = multer({
  dest: importStorageDir(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const extension = String(file.originalname || '').toLowerCase().match(/\.[^.]+$/)?.[0];
    const allowed = ['.xlsx', '.csv'].includes(extension);
    callback(allowed ? null : new AppError('Formato no permitido. Use .xlsx o .csv', 422), allowed);
  }
});
const productSearchCache = new Map();
const PRODUCT_SEARCH_CACHE_TTL_MS = 60 * 1000;
const PRODUCT_SEARCH_CACHE_MAX = 300;

function clearProductSearchCache() {
  productSearchCache.clear();
}

function productSearchCacheKey(search, limit) {
  return `${String(search || '').trim().replace(/\s+/g, ' ').toLowerCase()}::${limit}`;
}

function getCachedProductSearch(search, limit) {
  const key = productSearchCacheKey(search, limit);
  const cached = productSearchCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    productSearchCache.delete(key);
    return null;
  }
  return cached.rows;
}

function setCachedProductSearch(search, limit, rows) {
  if (productSearchCache.size >= PRODUCT_SEARCH_CACHE_MAX) {
    const oldestKey = productSearchCache.keys().next().value;
    if (oldestKey) productSearchCache.delete(oldestKey);
  }
  productSearchCache.set(productSearchCacheKey(search, limit), {
    rows,
    expiresAt: Date.now() + PRODUCT_SEARCH_CACHE_TTL_MS
  });
}

webApi.post('/auth/login', asyncHandler(async (req, res) => {
  const usuario = String(req.body.usuario || '').trim();
  const password = String(req.body.password || '');
  const ip = req.ip || '0.0.0.0';
  if (!usuario || !password) {
    throw new AppError('Ingrese usuario y contrasena', 422);
  }

  const attempt = await pool.query('SELECT intentos, bloqueado_hasta FROM login_attempts WHERE usuario = $1 AND ip = $2', [usuario, ip]);
  if (attempt.rows[0]?.bloqueado_hasta && new Date(attempt.rows[0].bloqueado_hasta) > new Date()) {
    throw new AppError('Demasiados intentos. Espere 15 minutos.', 429);
  }

  const { rows } = await pool.query(
    'SELECT id, nombre, usuario, password, rol FROM usuarios WHERE usuario = $1 AND estado = TRUE LIMIT 1',
    [usuario]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password))) {
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
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: user.id, rol: user.rol, jti }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  await pool.query('DELETE FROM login_attempts WHERE usuario = $1 AND ip = $2', [usuario, ip]);
  res.json({ ok: true, token, user: publicUser(user) });
}));

webApi.post('/auth/logout', requireWebUser, asyncHandler(async (req, res) => {
  const payload = req.tokenPayload;
  if (payload?.jti) {
    // Calcular cuándo expira el token para limpiar la blacklist automáticamente
    const expiraEn = payload.exp
      ? new Date(payload.exp * 1000).toISOString()
      : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    await pool.query(
      'INSERT INTO revoked_tokens (jti, usuario_id, expira_en) VALUES ($1, $2, $3) ON CONFLICT (jti) DO NOTHING',
      [payload.jti, req.user.id, expiraEn]
    );
    // Limpiar tokens ya expirados de la blacklist (mantenimiento)
    await pool.query('DELETE FROM revoked_tokens WHERE expira_en < NOW()').catch(() => {});
  }
  res.json({ ok: true, message: 'Sesion cerrada correctamente' });
}));

webApi.get('/auth/me', requireWebUser, asyncHandler(async (req, res) => {
  res.json({ ok: true, user: publicUser(req.user) });
}));

webApi.get('/dashboard', requireWebUser, asyncHandler(async (req, res) => {
  const [products, tomas, active, tomasFinalizadas, finalized, drafts, users, latestTomas] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS total FROM productos WHERE estado = TRUE'),
    pool.query('SELECT COUNT(*)::int AS total FROM tomas_fisicas'),
    pool.query("SELECT COUNT(*)::int AS total FROM tomas_fisicas WHERE estado = 'abierta'"),
    pool.query("SELECT COUNT(*)::int AS total FROM tomas_fisicas WHERE estado = 'finalizada'"),
    pool.query("SELECT COUNT(*)::int AS total FROM conteos WHERE estado = 'finalizado'"),
    pool.query("SELECT COUNT(*)::int AS total FROM conteos WHERE estado = 'borrador'"),
    pool.query('SELECT COUNT(*)::int AS total FROM usuarios WHERE estado = TRUE'),
    pool.query(
      `SELECT t.numero_toma, t.nombre_toma, t.estado, t.fecha_creacion, t.fecha_finalizacion,
              COALESCE(r.usuarios_asignados, 0) AS usuarios_asignados
       FROM tomas_fisicas t
       LEFT JOIN toma_resumen r ON r.toma_id = t.id
       ORDER BY t.id DESC
       LIMIT 8`
    )
  ]);
  res.json({
    ok: true,
    metrics: {
      productos: products.rows[0].total,
      tomas: tomas.rows[0].total,
      tomas_abiertas: active.rows[0].total,
      tomas_finalizadas: tomasFinalizadas.rows[0].total,
      conteos_finalizados: finalized.rows[0].total,
      conteos_borrador: drafts.rows[0].total,
      usuarios: users.rows[0].total
    },
    latest_tomas: latestTomas.rows
  });
}));

webApi.get('/mi/tomas', requireWebUser, requirePermission('count'), asyncHandler(async (req, res) => {
  await closeExpiredTomas(pool);
  const { rows } = await pool.query(
    `SELECT t.id AS toma_id, t.numero_toma, t.nombre_toma, t.agencia, t.estado AS toma_estado,
            t.fecha_habilitacion, t.fecha_cierre, t.hora_inicio, t.hora_fin,
            tu.estado AS asignacion_estado,
            c.id AS conteo_id, c.estado AS conteo_estado, c.version AS conteo_version,
            c.fecha_inicio, c.fecha_finalizacion,
            COUNT(d.id)::int AS lineas
     FROM toma_usuarios tu
     INNER JOIN tomas_fisicas t ON t.id = tu.toma_id
     LEFT JOIN conteos c ON c.toma_id = tu.toma_id AND c.usuario_id = tu.usuario_id
     LEFT JOIN conteo_detalle d ON d.conteo_id = c.id
     WHERE tu.usuario_id = $1 AND t.estado = 'abierta'
     GROUP BY t.id, t.numero_toma, t.nombre_toma, t.agencia, t.estado,
              t.fecha_habilitacion, t.fecha_cierre, t.hora_inicio, t.hora_fin,
              tu.estado, c.id, c.estado, c.version, c.fecha_inicio, c.fecha_finalizacion
     ORDER BY t.id DESC`,
    [req.user.id]
  );
  res.json({ ok: true, tomas: rows });
}));

webApi.post('/mi/tomas/:id/iniciar', requireWebUser, requirePermission('count'), asyncHandler(async (req, res) => {
  const tomaId = Number(req.params.id || 0);
  if (tomaId <= 0) {
    throw new AppError('Toma invalida', 422);
  }

  const conteoId = await withTransaction(async (db) => {
    await closeExpiredTomas(db, tomaId);
    const tomaResult = await db.query(
      `SELECT t.id, t.nombre_toma, t.fecha_habilitacion, t.fecha_cierre, t.hora_inicio, t.hora_fin
       FROM tomas_fisicas t
       INNER JOIN toma_usuarios tu ON tu.toma_id = t.id
       WHERE t.id = $1 AND tu.usuario_id = $2 AND t.estado = 'abierta'
       FOR UPDATE`,
      [tomaId, req.user.id]
    );
    const toma = tomaResult.rows[0];
    if (!toma) {
      throw new AppError('Toma no disponible', 422);
    }
    validateTomaWindow(toma);

    const current = await db.query('SELECT id FROM conteos WHERE toma_id = $1 AND usuario_id = $2 LIMIT 1', [tomaId, req.user.id]);
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

webApi.get('/mi/conteos/:id', requireWebUser, requirePermission('count'), asyncHandler(async (req, res) => {
  const conteoId = Number(req.params.id || 0);
  if (conteoId <= 0) {
    throw new AppError('Conteo invalido', 422);
  }
  const conteo = await pool.query(
    `SELECT c.id, c.version, c.estado, c.toma_id, t.numero_toma, t.nombre_toma,
            t.agencia, t.fecha_habilitacion, t.fecha_cierre, t.hora_inicio, t.hora_fin
     FROM conteos c
     INNER JOIN tomas_fisicas t ON t.id = c.toma_id
     WHERE c.id = $1 AND c.usuario_id = $2
     LIMIT 1`,
    [conteoId, req.user.id]
  );
  if (!conteo.rows[0]) {
    throw new AppError('Conteo no disponible', 404);
  }
  const items = await pool.query('SELECT producto_id, codigo, descripcion, cantidad FROM conteo_detalle WHERE conteo_id = $1 ORDER BY id', [conteoId]);
  res.json({ ok: true, conteo: conteo.rows[0], items: items.rows });
}));

webApi.get('/mi/productos', requireWebUser, requirePermission('count'), asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) {
    res.json({ ok: true, productos: [] });
    return;
  }
  const rows = await searchActiveProducts(q, 30);
  res.json({ ok: true, productos: rows });
}));

webApi.post('/mi/conteos/:id/borrador', requireWebUser, requirePermission('count'), asyncHandler(async (req, res) => {
  const conteoId = Number(req.params.id || 0);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const expectedVersion = Number(req.body.conteo_version || 0);
  if (conteoId <= 0 || items.length === 0) {
    throw new AppError('Datos incompletos', 422);
  }
  const result = await saveWebConteo(req.user.id, conteoId, expectedVersion, items, false);
  res.json(result);
}));

webApi.post('/mi/conteos/:id/finalizar', requireWebUser, requirePermission('count'), asyncHandler(async (req, res) => {
  const conteoId = Number(req.params.id || 0);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const expectedVersion = Number(req.body.conteo_version || 0);
  if (conteoId <= 0 || items.length === 0) {
    throw new AppError('Datos incompletos', 422);
  }
  const result = await saveWebConteo(req.user.id, conteoId, expectedVersion, items, true);
  res.json(result);
}));

webApi.get('/productos', requireWebUser, asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const page = Math.max(1, Number(req.query.page || 1));
  const perPage = Math.max(1, Math.min(Number(req.query.perPage || 30), 30));
  const sort = ['codigo', 'descripcion'].includes(String(req.query.sort || '')) ? String(req.query.sort) : 'codigo';
  const direction = String(req.query.direction || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
  const result = await listProducts({ q, page, perPage, sort, direction });
  res.json({ ok: true, ...result });
}));

webApi.post('/productos', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const codigo = String(req.body.codigo || '').trim();
  const descripcion = String(req.body.descripcion || '').trim();
  if (!codigo || !descripcion) {
    throw new AppError('Codigo y descripcion son requeridos', 422);
  }
  const { rows } = await pool.query(
    `INSERT INTO productos (codigo, descripcion, estado)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (codigo) DO UPDATE SET descripcion = EXCLUDED.descripcion, estado = TRUE
     RETURNING *`,
    [codigo, descripcion]
  );
  clearProductSearchCache();
  res.status(201).json({ ok: true, producto: rows[0] });
}));

webApi.post('/productos/import', requireWebUser, requirePermission('admin'), upload.single('archivo'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('Seleccione un archivo valido', 422);
  }
  const summary = await importProductsFromFile(req.file, req.user.id);
  clearProductSearchCache();
  res.status(201).json({ ok: true, importacion: summary });
}));

webApi.patch('/productos/:id', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const codigo = String(req.body.codigo || '').trim();
  const descripcion = String(req.body.descripcion || '').trim();
  if (!codigo || !descripcion) {
    throw new AppError('Codigo y descripcion son requeridos', 422);
  }
  const { rows } = await pool.query(
    'UPDATE productos SET codigo = $1, descripcion = $2, estado = $3 WHERE id = $4 RETURNING *',
    [codigo, descripcion, Boolean(req.body.estado), req.params.id]
  );
  if (!rows[0]) {
    throw new AppError('Producto no encontrado', 404);
  }
  clearProductSearchCache();
  res.json({ ok: true, producto: rows[0] });
}));

webApi.delete('/productos/:id', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM productos WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows[0]) {
    throw new AppError('Producto no encontrado', 404);
  }
  clearProductSearchCache();
  res.json({ ok: true, id: Number(rows[0].id), message: 'Producto eliminado correctamente' });
}));

webApi.get('/agencias', requireWebUser, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM agencias ORDER BY nombre');
  res.json({ ok: true, agencias: rows });
}));

webApi.post('/agencias', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre) {
    throw new AppError('Nombre requerido', 422);
  }
  const { rows } = await pool.query(
    'INSERT INTO agencias (nombre, estado) VALUES ($1, TRUE) ON CONFLICT (nombre) DO UPDATE SET estado = TRUE RETURNING *',
    [nombre]
  );
  res.status(201).json({ ok: true, agencia: rows[0] });
}));

webApi.patch('/agencias/:id', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const nombre = String(req.body.nombre || '').trim().toUpperCase();
  const estado = req.body.estado === undefined ? true : Boolean(req.body.estado);
  if (!nombre) {
    throw new AppError('Nombre requerido', 422);
  }
  const { rows } = await pool.query(
    'UPDATE agencias SET nombre = $1, estado = $2 WHERE id = $3 RETURNING *',
    [nombre, estado, req.params.id]
  );
  if (!rows[0]) {
    throw new AppError('Agencia no encontrada', 404);
  }
  res.json({ ok: true, agencia: rows[0] });
}));

webApi.delete('/agencias/:id', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('UPDATE agencias SET estado = FALSE WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows[0]) {
    throw new AppError('Agencia no encontrada', 404);
  }
  res.json({ ok: true, id: Number(rows[0].id), message: 'Agencia desactivada correctamente' });
}));

webApi.get('/usuarios', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT id, nombre, usuario, rol, estado, fecha_creacion FROM usuarios ORDER BY nombre');
  res.json({ ok: true, usuarios: rows });
}));

webApi.post('/usuarios', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const usuario = String(req.body.usuario || '').trim();
  const password = String(req.body.password || '');
  const rol = String(req.body.rol || 'usuario');
  if (!nombre || !usuario || password.length < 8) {
    throw new AppError('Complete nombre, usuario y password minimo de 8 caracteres', 422);
  }
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    'INSERT INTO usuarios (nombre, usuario, password, rol, estado) VALUES ($1, $2, $3, $4, TRUE) RETURNING id, nombre, usuario, rol, estado',
    [nombre, usuario, hash, rol]
  );
  res.status(201).json({ ok: true, usuario: rows[0] });
}));

webApi.patch('/usuarios/:id', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const usuario = String(req.body.usuario || '').trim();
  const password = String(req.body.password || '');
  const rol = String(req.body.rol || 'usuario');
  const estado = req.body.estado === undefined ? true : Boolean(req.body.estado);
  if (!nombre || !usuario) {
    throw new AppError('Complete los datos del usuario', 422);
  }
  if (password && password.length < 10) {
    throw new AppError('La contrasena debe tener al menos 10 caracteres', 422);
  }

  const params = [nombre, usuario, rol, estado, req.params.id];
  let sql = 'UPDATE usuarios SET nombre = $1, usuario = $2, rol = $3, estado = $4 WHERE id = $5 RETURNING id, nombre, usuario, rol, estado';
  if (password) {
    params.splice(2, 0, await bcrypt.hash(password, 12));
    sql = 'UPDATE usuarios SET nombre = $1, usuario = $2, password = $3, rol = $4, estado = $5 WHERE id = $6 RETURNING id, nombre, usuario, rol, estado';
  }
  const { rows } = await pool.query(sql, params);
  if (!rows[0]) {
    throw new AppError('Usuario no encontrado', 404);
  }
  res.json({ ok: true, usuario: rows[0] });
}));

webApi.delete('/usuarios/:id', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const current = await pool.query('SELECT id, rol FROM usuarios WHERE id = $1 LIMIT 1', [req.params.id]);
  if (!current.rows[0]) {
    throw new AppError('Usuario no encontrado', 404);
  }
  if (current.rows[0].rol === 'admin') {
    throw new AppError('El administrador no se puede eliminar', 422);
  }
  const { rows } = await pool.query('UPDATE usuarios SET estado = FALSE WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows[0]) {
    throw new AppError('Usuario no encontrado', 404);
  }
  res.json({ ok: true, id: Number(rows[0].id), message: 'Usuario desactivado correctamente' });
}));

webApi.get('/tomas', requireWebUser, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.*,
     COALESCE(r.usuarios_asignados, 0) AS usuarios_asignados,
      COALESCE(r.usuarios_finalizados, 0) AS usuarios_finalizados,
      COALESCE(p.usuarios_en_proceso, 0) AS usuarios_en_proceso,
      COALESCE(r.unidades_contadas, 0) AS unidades_contadas
     FROM tomas_fisicas t
     LEFT JOIN toma_resumen r ON r.toma_id = t.id
     LEFT JOIN (
       SELECT toma_id, COUNT(*)::int AS usuarios_en_proceso
       FROM toma_usuarios
       WHERE estado = 'en_proceso'
       GROUP BY toma_id
     ) p ON p.toma_id = t.id
     ORDER BY t.id DESC
     LIMIT 100`
  );
  res.json({ ok: true, tomas: rows });
}));

webApi.post('/tomas', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const fields = validateTomaPayload(req.body);
  const usuarios = normalizeIds(req.body.usuarios);
  if (!usuarios.length) {
    throw new AppError('Seleccione al menos un usuario participante', 422);
  }

  const result = await withTransaction(async (db) => {
    const numeroToma = await nextTomaNumber(db, fields.fecha_habilitacion);
    const nombreToma = buildTomaName(numeroToma, fields);
    const toma = await db.query(
      `INSERT INTO tomas_fisicas (
        numero_toma, agencia, fecha_toma, fecha_habilitacion, fecha_cierre, hora_inicio, hora_fin, nombre_toma, estado, creado_por
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'abierta',$9) RETURNING *`,
      [
        numeroToma,
        fields.agencia || null,
        fields.fecha_habilitacion,
        fields.fecha_habilitacion,
        fields.fecha_cierre,
        fields.hora_inicio,
        fields.hora_fin,
        nombreToma,
        req.user.id
      ]
    );
    const participantes = await validCountingUsers(db, usuarios);
    if (!participantes.length) {
      throw new AppError('Sin usuarios participantes', 422);
    }
    for (const usuarioId of participantes) {
      await db.query('INSERT INTO toma_usuarios (toma_id, usuario_id) VALUES ($1, $2)', [toma.rows[0].id, usuarioId]);
    }
    await refreshTomaSummary(db, toma.rows[0].id);
    return { ...toma.rows[0], usuarios_asignados: participantes.length };
  });
  res.status(201).json({ ok: true, toma: result, message: 'Toma fisica creada para usuarios activos' });
}));

webApi.get('/tomas/:id', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const tomaId = Number(req.params.id || 0);
  const toma = await pool.query(
    `SELECT t.*, u.nombre AS creado_por_nombre,
            COALESCE(r.usuarios_asignados, 0) AS usuarios_asignados,
            COALESCE(r.usuarios_finalizados, 0) AS usuarios_finalizados,
            COALESCE(r.unidades_contadas, 0) AS unidades_contadas
     FROM tomas_fisicas t
     INNER JOIN usuarios u ON u.id = t.creado_por
     LEFT JOIN toma_resumen r ON r.toma_id = t.id
     WHERE t.id = $1`,
    [tomaId]
  );
  if (!toma.rows[0]) {
    throw new AppError('Toma no encontrada', 404);
  }
  const participantes = await pool.query(
    `SELECT tu.estado AS asignacion_estado, tu.fecha_asignacion, u.id AS usuario_id, u.nombre, u.usuario,
            c.id AS conteo_id, c.estado AS conteo_estado, c.fecha_inicio, c.fecha_finalizacion, c.archivo_excel,
            COUNT(d.id)::int AS lineas,
            COALESCE(SUM(d.cantidad), 0)::numeric AS unidades
     FROM toma_usuarios tu
     INNER JOIN usuarios u ON u.id = tu.usuario_id
     LEFT JOIN conteos c ON c.toma_id = tu.toma_id AND c.usuario_id = tu.usuario_id
     LEFT JOIN conteo_detalle d ON d.conteo_id = c.id
     WHERE tu.toma_id = $1
     GROUP BY tu.estado, tu.fecha_asignacion, u.id, u.nombre, u.usuario,
              c.id, c.estado, c.fecha_inicio, c.fecha_finalizacion, c.archivo_excel
     ORDER BY u.nombre`,
    [tomaId]
  );
  // Calcular pendientes en JS: asignados - finalizados - en_proceso
  const resumen = participantes.rows.reduce(
    (acc, p) => {
      acc.asignados++;
      if (p.asignacion_estado === 'finalizado') acc.finalizados++;
      if (p.asignacion_estado === 'en_proceso') acc.en_proceso++;
      acc.lineas += Number(p.lineas || 0);
      acc.unidades += Number(p.unidades || 0);
      return acc;
    },
    { asignados: 0, finalizados: 0, en_proceso: 0, lineas: 0, unidades: 0 }
  );
  resumen.pendientes = Math.max(0, resumen.asignados - resumen.finalizados - resumen.en_proceso);
  res.json({ ok: true, toma: toma.rows[0], participantes: participantes.rows, resumen });
}));

webApi.patch('/tomas/:id', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const tomaId = Number(req.params.id || 0);
  const fields = validateTomaPayload(req.body);
  const result = await withTransaction(async (db) => {
    const current = await db.query('SELECT numero_toma FROM tomas_fisicas WHERE id = $1 FOR UPDATE', [tomaId]);
    if (!current.rows[0]) {
      throw new AppError('Toma no encontrada', 404);
    }
    const nombreToma = buildTomaName(current.rows[0].numero_toma, fields);
    const { rows } = await db.query(
      `UPDATE tomas_fisicas
       SET agencia = $1, fecha_toma = $2, fecha_habilitacion = $3, fecha_cierre = $4, hora_inicio = $5, hora_fin = $6, nombre_toma = $7
       WHERE id = $8
       RETURNING *`,
      [fields.agencia || null, fields.fecha_habilitacion, fields.fecha_habilitacion, fields.fecha_cierre, fields.hora_inicio, fields.hora_fin, nombreToma, tomaId]
    );
    await refreshTomaSummary(db, tomaId);
    return rows[0];
  });
  res.json({ ok: true, toma: result, message: 'Toma actualizada correctamente' });
}));

webApi.delete('/tomas/:id', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const tomaId = Number(req.params.id || 0);
  await withTransaction(async (db) => {
    const detail = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM conteo_detalle d
       INNER JOIN conteos c ON c.id = d.conteo_id
       WHERE c.toma_id = $1`,
      [tomaId]
    );
    if (detail.rows[0].total > 0) {
      throw new AppError('La toma tiene conteos con detalle', 422);
    }
    await db.query('DELETE FROM toma_usuarios WHERE toma_id = $1', [tomaId]);
    await db.query('DELETE FROM conteos WHERE toma_id = $1', [tomaId]);
    const deleted = await db.query('DELETE FROM tomas_fisicas WHERE id = $1 RETURNING id', [tomaId]);
    if (!deleted.rows[0]) {
      throw new AppError('Toma no encontrada', 404);
    }
  });
  res.json({ ok: true, id: tomaId, message: 'Toma eliminada correctamente' });
}));

webApi.post('/tomas/:id/asignaciones', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const tomaId = Number(req.params.id || 0);
  const usuarios = normalizeIds(req.body.usuarios);
  if (!usuarios.length) {
    throw new AppError('Seleccione usuarios validos', 422);
  }
  const assigned = await withTransaction(async (db) => {
    const toma = await db.query("SELECT id FROM tomas_fisicas WHERE id = $1 AND estado = 'abierta' FOR UPDATE", [tomaId]);
    if (!toma.rows[0]) {
      throw new AppError('Toma no disponible para asignacion', 422);
    }
    const valid = await validCountingUsers(db, usuarios);
    let count = 0;
    for (const usuarioId of valid) {
      const inserted = await db.query(
        'INSERT INTO toma_usuarios (toma_id, usuario_id) VALUES ($1, $2) ON CONFLICT (toma_id, usuario_id) DO NOTHING RETURNING id',
        [tomaId, usuarioId]
      );
      if (inserted.rowCount > 0) {
        count += 1;
      }
    }
    if (count === 0) {
      throw new AppError('Sin usuarios nuevos para asignar', 422);
    }
    await refreshTomaSummary(db, tomaId);
    return count;
  });
  res.json({ ok: true, usuarios_asignados: assigned, message: 'Usuarios asignados correctamente' });
}));

webApi.post('/tomas/:id/estado', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const tomaId = Number(req.params.id || 0);
  const accion = String(req.body.accion || '');
  if (!['cerrar', 'reabrir'].includes(accion)) {
    throw new AppError('Accion invalida', 422);
  }
  const toma = await withTransaction(async (db) => {
    const current = await db.query('SELECT id FROM tomas_fisicas WHERE id = $1 FOR UPDATE', [tomaId]);
    if (!current.rows[0]) {
      throw new AppError('Toma no encontrada', 404);
    }
    if (accion === 'cerrar') {
      await db.query("UPDATE tomas_fisicas SET estado = 'finalizada', fecha_finalizacion = NOW() WHERE id = $1 AND estado = 'abierta'", [tomaId]);
      await db.query(
        `UPDATE conteos c
         SET estado = 'finalizado', fecha_finalizacion = COALESCE(fecha_finalizacion, NOW()), updated_at = NOW()
         WHERE c.toma_id = $1
           AND c.estado = 'borrador'
           AND EXISTS (SELECT 1 FROM conteo_detalle d WHERE d.conteo_id = c.id)`,
        [tomaId]
      );
      await db.query(
        `UPDATE toma_usuarios tu
         SET estado = 'finalizado'
         WHERE tu.toma_id = $1
           AND EXISTS (SELECT 1 FROM conteos c INNER JOIN conteo_detalle d ON d.conteo_id = c.id WHERE c.toma_id = tu.toma_id AND c.usuario_id = tu.usuario_id)`,
        [tomaId]
      );
    } else {
      await db.query("UPDATE tomas_fisicas SET estado = 'abierta', fecha_finalizacion = NULL, archivo_excel = NULL WHERE id = $1 AND estado = 'finalizada'", [tomaId]);
    }
    await refreshTomaSummary(db, tomaId);
    const updated = await db.query('SELECT * FROM tomas_fisicas WHERE id = $1', [tomaId]);
    return updated.rows[0];
  });
  res.json({ ok: true, toma, message: accion === 'cerrar' ? 'Toma cerrada correctamente' : 'Toma reabierta correctamente' });
}));

webApi.post('/tomas/:id/reutilizar', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const sourceId = Number(req.params.id || 0);
  const fields = validateTomaPayload(req.body, { allowAgencyEmpty: true });
  const toma = await withTransaction(async (db) => {
    const source = await db.query('SELECT id, agencia FROM tomas_fisicas WHERE id = $1 FOR UPDATE', [sourceId]);
    if (!source.rows[0]) {
      throw new AppError('Toma origen no encontrada', 404);
    }
    const numeroToma = await nextTomaNumber(db, fields.fecha_habilitacion);
    const sourceFields = { ...fields, agencia: String(source.rows[0].agencia || '').toUpperCase() };
    const nombreToma = buildTomaName(numeroToma, sourceFields);
    const created = await db.query(
      `INSERT INTO tomas_fisicas (numero_toma, agencia, fecha_toma, fecha_habilitacion, fecha_cierre, hora_inicio, hora_fin, nombre_toma, estado, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'abierta',$9)
       RETURNING *`,
      [numeroToma, sourceFields.agencia || null, fields.fecha_habilitacion, fields.fecha_habilitacion, fields.fecha_cierre, fields.hora_inicio, fields.hora_fin, nombreToma, req.user.id]
    );
    await db.query(
      `INSERT INTO toma_usuarios (toma_id, usuario_id)
       SELECT $1, tu.usuario_id
       FROM toma_usuarios tu
       INNER JOIN usuarios u ON u.id = tu.usuario_id
       WHERE tu.toma_id = $2 AND u.estado = TRUE AND u.rol IN ('usuario', 'operador')`,
      [created.rows[0].id, sourceId]
    );
    await refreshTomaSummary(db, created.rows[0].id);
    return created.rows[0];
  });
  res.status(201).json({ ok: true, toma, message: 'Toma reutilizada correctamente' });
}));

webApi.post('/tomas/:id/usuarios/:usuarioId/habilitar', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const tomaId = Number(req.params.id || 0);
  const usuarioId = Number(req.params.usuarioId || 0);
  await withTransaction(async (db) => {
    await db.query(
      "UPDATE conteos SET estado = 'borrador', fecha_finalizacion = NULL WHERE toma_id = $1 AND usuario_id = $2 AND estado = 'finalizado'",
      [tomaId, usuarioId]
    );
    await db.query("UPDATE toma_usuarios SET estado = 'en_proceso' WHERE toma_id = $1 AND usuario_id = $2", [tomaId, usuarioId]);
    await db.query("UPDATE tomas_fisicas SET estado = 'abierta', fecha_finalizacion = NULL WHERE id = $1", [tomaId]);
    await refreshTomaSummary(db, tomaId);
  });
  res.json({ ok: true, message: 'Conteo habilitado para edicion' });
}));

webApi.get('/conteos', requireWebUser, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, u.nombre AS usuario_nombre, t.numero_toma, t.nombre_toma
     FROM conteos c
     INNER JOIN usuarios u ON u.id = c.usuario_id
     LEFT JOIN tomas_fisicas t ON t.id = c.toma_id
     ORDER BY c.id DESC
     LIMIT 150`
  );
  res.json({ ok: true, conteos: rows });
}));

webApi.get('/conteos/:id/excel', requireWebUser, asyncHandler(async (req, res) => {
  const conteoId = Number(req.params.id || 0);
  if (conteoId <= 0) {
    throw new AppError('Conteo invalido', 422);
  }
  const file = await exportConteoExcel(conteoId, req.user);
  res.download(file.fullPath, file.filename);
}));

webApi.post('/tomas/:id/consolidado', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const tomaId = Number(req.params.id || 0);
  if (tomaId <= 0) {
    throw new AppError('Toma invalida', 422);
  }
  const file = await generateConsolidadoExcel(tomaId);
  res.json({ ok: true, archivo: file.filename, download_url: `/api/admin/tomas/${tomaId}/consolidado` });
}));

webApi.get('/tomas/:id/consolidado', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const tomaId = Number(req.params.id || 0);
  if (tomaId <= 0) {
    throw new AppError('Toma invalida', 422);
  }
  const file = await generateConsolidadoExcel(tomaId);
  res.download(file.fullPath, file.filename);
}));

function publicUser(user) {
  return {
    id: Number(user.id),
    nombre: user.nombre,
    usuario: user.usuario,
    rol: user.rol
  };
}

async function listProducts({ q = '', page = 1, perPage = 30, sort = 'codigo', direction = 'asc' }) {
  const filter = productSearchFilter(q);
  const count = await pool.query(`SELECT COUNT(*)::int AS total FROM productos WHERE ${filter.where}`, filter.params);
  const total = Number(count.rows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const orderColumn = sort === 'descripcion' ? 'descripcion' : 'codigo';
  const orderDirection = direction === 'desc' ? 'DESC' : 'ASC';
  const orderClause = orderColumn === 'descripcion'
    ? `descripcion ${orderDirection}, codigo ASC`
    : `CASE WHEN codigo ~ '^\\d{1,30}$' THEN codigo::numeric END ${orderDirection} NULLS LAST, codigo ${orderDirection}`;
  const params = [...filter.params, perPage, (currentPage - 1) * perPage];
  const { rows } = await pool.query(
    `SELECT id, codigo, descripcion, estado, fecha_creacion
     FROM productos
     WHERE ${filter.where}
     ORDER BY ${orderClause}, id ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return {
    productos: rows,
    total,
    page: currentPage,
    totalPages,
    perPage,
    sort,
    direction
  };
}

async function searchActiveProducts(search, limit = 30, options = {}) {
  const q = String(search || '').trim();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 30, 500));
  const select = options.includeMeta
    ? 'id, codigo, descripcion, estado, fecha_creacion'
    : 'id, codigo, descripcion';
  const canUseCache = !options.includeMeta && !options.includeEmpty;

  if (canUseCache) {
    const cached = getCachedProductSearch(q, safeLimit);
    if (cached) return cached;
  }

  if (!q) {
    if (!options.includeEmpty) return [];
    const { rows } = await pool.query(
      `SELECT ${select}
       FROM productos
       WHERE estado = TRUE
       ORDER BY descripcion, codigo
       LIMIT $1`,
      [safeLimit]
    );
    return rows;
  }

  const codePrefix = `${escapeLike(q)}%`;
  const contains = `%${escapeLike(q)}%`;
  const searchIsCode = /^\d+$/.test(q);

  if (searchIsCode) {
    const exact = await pool.query(
      `SELECT ${select}
       FROM productos
       WHERE estado = TRUE AND codigo = $1
       LIMIT 1`,
      [q]
    );
    if (exact.rows.length) {
      if (canUseCache) setCachedProductSearch(q, safeLimit, exact.rows);
      return exact.rows;
    }

    const { rows } = await pool.query(
      `SELECT ${select}
       FROM productos
       WHERE estado = TRUE
         AND (
           codigo ILIKE $1 ESCAPE '\\'
           OR descripcion ILIKE $2 ESCAPE '\\'
           OR descripcion % $3
         )
       ORDER BY
         CASE WHEN codigo ILIKE $1 ESCAPE '\\' THEN 0 ELSE 1 END,
         similarity(descripcion, $3) DESC,
         codigo
       LIMIT $4`,
      [codePrefix, contains, q, safeLimit]
    );
    if (canUseCache) setCachedProductSearch(q, safeLimit, rows);
    return rows;
  }

  const { rows } = await pool.query(
    `SELECT ${select}
     FROM productos
     WHERE estado = TRUE
       AND (
         codigo ILIKE $1 ESCAPE '\\'
         OR descripcion ILIKE $2 ESCAPE '\\'
         OR descripcion % $3
       )
     ORDER BY
       CASE WHEN codigo ILIKE $1 ESCAPE '\\' THEN 0 ELSE 1 END,
       similarity(descripcion, $3) DESC,
       descripcion,
       codigo
    LIMIT $4`,
    [codePrefix, contains, q, safeLimit]
  );
  if (canUseCache) setCachedProductSearch(q, safeLimit, rows);
  return rows;
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}

function productSearchFilter(search) {
  const q = String(search || '').trim();
  if (!q) {
    return { where: 'estado = TRUE', params: [] };
  }
  const codePrefix = `${escapeLike(q)}%`;
  const contains = `%${escapeLike(q)}%`;
  if (/^\d+$/.test(q)) {
    return {
      where: "(estado = TRUE AND (codigo ILIKE $1 ESCAPE '\\' OR descripcion ILIKE $2 ESCAPE '\\' OR descripcion % $3))",
      params: [codePrefix, contains, q]
    };
  }
  return {
    where: "(estado = TRUE AND (codigo ILIKE $1 ESCAPE '\\' OR descripcion ILIKE $2 ESCAPE '\\' OR descripcion % $3))",
    params: [codePrefix, contains, q]
  };
}

function normalizeIds(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
}

function validateTomaPayload(body, options = {}) {
  const agencia = String(body.agencia || '').trim().toUpperCase();
  const fecha_habilitacion = String(body.fecha_habilitacion || body.fecha_conteo || '').trim();
  const fecha_cierre = String(body.fecha_cierre || '').trim();
  const hora_inicio = String(body.hora_inicio || '').trim();
  const hora_fin = String(body.hora_fin || '').trim();

  if (!options.allowAgencyEmpty && agencia.length > 120) {
    throw new AppError('Agencia invalida', 422);
  }
  if (!fecha_habilitacion || !fecha_cierre || !hora_inicio || !hora_fin) {
    throw new AppError('Complete fechas y horas de la toma', 422);
  }
  if (!isIsoDate(fecha_habilitacion) || !isIsoDate(fecha_cierre)) {
    throw new AppError('Fecha invalida', 422);
  }
  if (fecha_cierre < fecha_habilitacion) {
    throw new AppError('La fecha de finalizacion no puede ser menor a la habilitacion', 422);
  }
  if (!/^\d{2}:\d{2}$/.test(hora_inicio) || !/^\d{2}:\d{2}$/.test(hora_fin)) {
    throw new AppError('Hora invalida', 422);
  }

  return { agencia, fecha_habilitacion, fecha_cierre, hora_inicio, hora_fin };
}

async function nextTomaNumber(db, fechaHabilitacion) {
  const year = fechaHabilitacion.slice(0, 4);
  const last = await db.query(
    `SELECT numero_toma
     FROM tomas_fisicas
     WHERE numero_toma LIKE $1
     ORDER BY numero_toma DESC
     LIMIT 1
     FOR UPDATE`,
    [`${year}-%`]
  );
  const match = String(last.rows[0]?.numero_toma || '').match(/^\d{4}-(\d{3})$/);
  const nextSequence = match ? Number(match[1]) + 1 : 1;
  return `${year}-${String(nextSequence).padStart(3, '0')}`;
}

function buildTomaName(numeroToma, fields) {
  const dayName = dayNameEs(fields.fecha_habilitacion);
  const endDayName = dayNameEs(fields.fecha_cierre);
  return [
    `TOMA FISICA # ${numeroToma}`,
    `AGENCIA: ${fields.agencia || ''}`,
    `HABILITACION: ${dayName} ${formatDateEc(fields.fecha_habilitacion)} ${fields.hora_inicio}`,
    `FINALIZACION: ${endDayName} ${formatDateEc(fields.fecha_cierre)} ${fields.hora_fin}`
  ].join('\n');
}

async function validCountingUsers(db, ids) {
  if (!ids.length) {
    return [];
  }
  const placeholders = ids.map((_, index) => `$${index + 1}`).join(',');
  const { rows } = await db.query(
    `SELECT id
     FROM usuarios
     WHERE rol IN ('usuario', 'operador') AND estado = TRUE AND id IN (${placeholders})`,
    ids
  );
  return rows.map((row) => Number(row.id));
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dayNameEs(value) {
  const days = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
  return days[new Date(`${value}T00:00:00Z`).getUTCDay()];
}

function formatDateEc(value) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

async function saveWebConteo(userId, conteoId, expectedVersion, items, finish) {
  return withTransaction(async (db) => {
    const conteo = await activeDraftForUser(db, conteoId, userId, true);
    if (!conteo) {
      throw new AppError('Conteo no disponible', 422);
    }
    validateTomaWindow(conteo);
    assertVersion(conteo, expectedVersion);
    const lineas = await replaceDetalle(db, conteoId, items);
    if (lineas === 0) {
      throw new AppError('Sin productos validos', 422);
    }
    const version = await bumpVersion(db, conteoId);

    if (finish) {
      await db.query(
        "UPDATE conteos SET estado = 'finalizado', fecha_finalizacion = NOW(), archivo_excel = NULL, updated_at = NOW() WHERE id = $1",
        [conteoId]
      );
      await db.query("UPDATE toma_usuarios SET estado = 'finalizado' WHERE toma_id = $1 AND usuario_id = $2", [conteo.toma_id, userId]);
      await db.query('UPDATE tomas_fisicas SET archivo_excel = NULL WHERE id = $1', [conteo.toma_id]);
      await closeTomaIfComplete(db, conteo.toma_id);
      await refreshTomaSummary(db, conteo.toma_id);
    }

    return { ok: true, conteo_id: conteoId, conteo_version: version, lineas, estado: finish ? 'finalizado' : 'borrador' };
  });
}
