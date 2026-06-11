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
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/errors.js';

export const webApi = express.Router();
await ensureStorage();
const upload = multer({
  dest: importStorageDir(),
  limits: { fileSize: 30 * 1024 * 1024 }
});

webApi.post('/auth/login', asyncHandler(async (req, res) => {
  const usuario = String(req.body.usuario || '').trim();
  const password = String(req.body.password || '');
  const { rows } = await pool.query(
    'SELECT id, nombre, usuario, password, rol FROM usuarios WHERE usuario = $1 AND estado = TRUE LIMIT 1',
    [usuario]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new AppError('Usuario o contrasena incorrectos', 401);
  }
  const token = jwt.sign({ sub: user.id, rol: user.rol }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  res.json({ ok: true, token, user: publicUser(user) });
}));

webApi.get('/auth/me', requireWebUser, asyncHandler(async (req, res) => {
  res.json({ ok: true, user: publicUser(req.user) });
}));

webApi.get('/dashboard', requireWebUser, asyncHandler(async (req, res) => {
  const [products, tomas, active, finalized, users] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS total FROM productos WHERE estado = TRUE'),
    pool.query('SELECT COUNT(*)::int AS total FROM tomas_fisicas'),
    pool.query("SELECT COUNT(*)::int AS total FROM tomas_fisicas WHERE estado = 'abierta'"),
    pool.query("SELECT COUNT(*)::int AS total FROM conteos WHERE estado = 'finalizado'"),
    pool.query('SELECT COUNT(*)::int AS total FROM usuarios WHERE estado = TRUE')
  ]);
  res.json({
    ok: true,
    metrics: {
      productos: products.rows[0].total,
      tomas: tomas.rows[0].total,
      tomas_abiertas: active.rows[0].total,
      conteos_finalizados: finalized.rows[0].total,
      usuarios: users.rows[0].total
    }
  });
}));

webApi.get('/productos', requireWebUser, asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const { rows } = await pool.query(
    `SELECT id, codigo, descripcion, estado, fecha_creacion
     FROM productos
     WHERE ($1 = '' OR codigo ILIKE $2 OR descripcion ILIKE $3)
     ORDER BY descripcion, codigo
     LIMIT 200`,
    [q, `${q}%`, `%${q}%`]
  );
  res.json({ ok: true, productos: rows });
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
  res.status(201).json({ ok: true, producto: rows[0] });
}));

webApi.post('/productos/import', requireWebUser, requirePermission('admin'), upload.single('archivo'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('Seleccione un archivo valido', 422);
  }
  const summary = await importProductsFromFile(req.file, req.user.id);
  res.status(201).json({ ok: true, importacion: summary });
}));

webApi.patch('/productos/:id', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE productos SET codigo = $1, descripcion = $2, estado = $3 WHERE id = $4 RETURNING *',
    [req.body.codigo, req.body.descripcion, Boolean(req.body.estado), req.params.id]
  );
  res.json({ ok: true, producto: rows[0] });
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

webApi.get('/tomas', requireWebUser, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.*,
      COALESCE(r.usuarios_asignados, 0) AS usuarios_asignados,
      COALESCE(r.usuarios_finalizados, 0) AS usuarios_finalizados,
      COALESCE(r.unidades_contadas, 0) AS unidades_contadas
     FROM tomas_fisicas t
     LEFT JOIN toma_resumen r ON r.toma_id = t.id
     ORDER BY t.id DESC
     LIMIT 100`
  );
  res.json({ ok: true, tomas: rows });
}));

webApi.post('/tomas', requireWebUser, requirePermission('admin'), asyncHandler(async (req, res) => {
  const body = req.body;
  const result = await withTransaction(async (db) => {
    const toma = await db.query(
      `INSERT INTO tomas_fisicas (
        numero_toma, agencia, fecha_toma, fecha_habilitacion, fecha_cierre, hora_inicio, hora_fin, nombre_toma, creado_por
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        body.numero_toma,
        body.agencia || null,
        body.fecha_toma,
        body.fecha_habilitacion || null,
        body.fecha_cierre || null,
        body.hora_inicio || null,
        body.hora_fin || null,
        body.nombre_toma,
        req.user.id
      ]
    );
    const usuarios = Array.isArray(body.usuarios) ? body.usuarios : [];
    for (const usuarioId of usuarios) {
      await db.query(
        'INSERT INTO toma_usuarios (toma_id, usuario_id) VALUES ($1, $2) ON CONFLICT (toma_id, usuario_id) DO NOTHING',
        [toma.rows[0].id, usuarioId]
      );
    }
    return toma.rows[0];
  });
  res.status(201).json({ ok: true, toma: result });
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
