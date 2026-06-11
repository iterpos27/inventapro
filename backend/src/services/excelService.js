import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../utils/errors.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const storageRoot = path.resolve(dirname, '../../storage');
const exportDir = path.join(storageRoot, 'exports');
const importDir = path.join(storageRoot, 'imports');

export async function ensureStorage() {
  await fs.mkdir(exportDir, { recursive: true });
  await fs.mkdir(importDir, { recursive: true });
}

export function importStorageDir() {
  return importDir;
}

export async function exportConteoExcel(conteoId, user) {
  const params = [conteoId];
  let authSql = '';
  if (user.rol !== 'admin') {
    params.push(user.id);
    authSql = ` AND c.usuario_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT d.codigo, d.descripcion, d.cantidad, u.nombre AS usuario
     FROM conteo_detalle d
     INNER JOIN conteos c ON c.id = d.conteo_id
     INNER JOIN usuarios u ON u.id = c.usuario_id
     WHERE d.conteo_id = $1 AND c.estado = 'finalizado'${authSql}
     ORDER BY d.id`,
    params
  );
  if (!rows.length) {
    throw new AppError('Sin detalle para exportar', 404);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'InventaPro';
  const sheet = workbook.addWorksheet('Conteo');
  sheet.columns = [
    { header: 'Codigo', key: 'codigo', width: 18 },
    { header: 'Descripcion', key: 'descripcion', width: 55 },
    { header: 'Cantidad', key: 'cantidad', width: 14 },
    { header: 'Usuario', key: 'usuario', width: 28 }
  ];
  rows.forEach((row) => sheet.addRow(row));
  styleSheet(sheet);

  await ensureStorage();
  const filename = `conteo_${conteoId}_${timestamp()}.xlsx`;
  const fullPath = path.join(exportDir, filename);
  await workbook.xlsx.writeFile(fullPath);
  return { fullPath, filename };
}

export async function generateConsolidadoExcel(tomaId) {
  const tomaResult = await pool.query('SELECT id, numero_toma, nombre_toma FROM tomas_fisicas WHERE id = $1', [tomaId]);
  const toma = tomaResult.rows[0];
  if (!toma) {
    throw new AppError('Toma no encontrada', 404);
  }

  const usuariosResult = await pool.query(
    `SELECT DISTINCT u.id, u.nombre
     FROM conteos c
     INNER JOIN usuarios u ON u.id = c.usuario_id
     WHERE c.toma_id = $1 AND c.estado = 'finalizado'
     ORDER BY u.nombre`,
    [tomaId]
  );
  const usuarios = usuariosResult.rows;
  if (!usuarios.length) {
    throw new AppError('Sin usuarios finalizados', 422);
  }

  const detallesResult = await pool.query(
    `SELECT d.producto_id, d.codigo, d.descripcion, c.usuario_id, SUM(d.cantidad)::numeric AS cantidad
     FROM conteos c
     INNER JOIN conteo_detalle d ON d.conteo_id = c.id
     WHERE c.toma_id = $1 AND c.estado = 'finalizado'
     GROUP BY d.producto_id, d.codigo, d.descripcion, c.usuario_id
     ORDER BY d.codigo, d.descripcion`,
    [tomaId]
  );
  if (!detallesResult.rows.length) {
    throw new AppError('Sin productos contados', 422);
  }

  const productos = new Map();
  for (const detalle of detallesResult.rows) {
    const key = String(detalle.producto_id || detalle.codigo);
    if (!productos.has(key)) {
      productos.set(key, {
        codigo: detalle.codigo,
        descripcion: detalle.descripcion,
        usuarios: new Map(),
        total: 0
      });
    }
    const producto = productos.get(key);
    const cantidad = Number(detalle.cantidad || 0);
    producto.usuarios.set(Number(detalle.usuario_id), cantidad);
    producto.total += cantidad;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'InventaPro';
  const sheet = workbook.addWorksheet('Consolidado');
  const columns = [
    { header: 'Codigo', key: 'codigo', width: 18 },
    { header: 'Descripcion', key: 'descripcion', width: 55 },
    ...usuarios.map((usuario) => ({ header: usuario.nombre, key: `usuario_${usuario.id}`, width: 18 })),
    { header: 'Cantidad total', key: 'total', width: 18 }
  ];
  sheet.columns = columns;

  for (const producto of productos.values()) {
    const row = {
      codigo: producto.codigo,
      descripcion: producto.descripcion,
      total: producto.total
    };
    usuarios.forEach((usuario) => {
      row[`usuario_${usuario.id}`] = producto.usuarios.get(Number(usuario.id)) || '';
    });
    sheet.addRow(row);
  }
  styleSheet(sheet);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  await ensureStorage();
  const filename = `consolidado_toma_${tomaId}_${timestamp()}.xlsx`;
  const fullPath = path.join(exportDir, filename);
  await workbook.xlsx.writeFile(fullPath);
  await pool.query('UPDATE tomas_fisicas SET archivo_excel = $1 WHERE id = $2', [filename, tomaId]);
  return { fullPath, filename };
}

export async function importProductsFromFile(file, userId) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  if (!['.xlsx', '.csv'].includes(extension)) {
    throw new AppError('Formato no permitido. Use .xlsx o .csv', 422);
  }

  const workbook = new ExcelJS.Workbook();
  if (extension === '.csv') {
    await workbook.csv.readFile(file.path);
  } else {
    await workbook.xlsx.readFile(file.path);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) {
    throw new AppError('Archivo sin datos', 422);
  }

  const headerRow = sheet.getRow(1);
  const headers = {};
  headerRow.eachCell((cell, colNumber) => {
    const key = normalizeHeader(cell.value);
    if (key) {
      headers[key] = colNumber;
    }
  });

  const codigoCol = headers.codigo;
  const descripcionCol = headers.descripcion;
  if (!codigoCol || !descripcionCol) {
    throw new AppError('Columnas requeridas no encontradas: codigo, descripcion', 422);
  }

  const products = [];
  let omitidos = 0;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }
    const codigo = normalizeProductCode(row.getCell(codigoCol).value);
    const descripcion = String(row.getCell(descripcionCol).text || '').trim();
    if (!codigo || !descripcion) {
      omitidos += 1;
      return;
    }
    products.push({ codigo, descripcion });
  });

  const summary = await withTransaction(async (db) => {
    const job = await db.query(
      `INSERT INTO import_jobs
        (usuario_id, archivo, nombre_original, extension, codigo_col, descripcion_col, total_rows, estado, actualizado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'procesando',NOW())
       RETURNING id`,
      [userId, file.path, file.originalname, extension.slice(1), codigoCol, descripcionCol, sheet.rowCount]
    );
    let insertados = 0;
    let actualizados = 0;
    for (const product of products) {
      const existing = await db.query('SELECT id FROM productos WHERE codigo = $1', [product.codigo]);
      await db.query(
        `INSERT INTO productos (codigo, descripcion, estado)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (codigo) DO UPDATE SET descripcion = EXCLUDED.descripcion, estado = TRUE`,
        [product.codigo, product.descripcion]
      );
      if (existing.rowCount > 0) {
        actualizados += 1;
      } else {
        insertados += 1;
      }
    }
    await db.query(
      `UPDATE import_jobs
       SET current_row = $1, procesados = $2, insertados = $3, actualizados = $4, omitidos = $5,
           estado = 'finalizado', actualizado_en = NOW(), finalizado_en = NOW()
       WHERE id = $6`,
      [sheet.rowCount + 1, products.length, insertados, actualizados, omitidos, job.rows[0].id]
    );
    return { job_id: Number(job.rows[0].id), procesados: products.length, insertados, actualizados, omitidos };
  });

  await fs.unlink(file.path).catch(() => {});
  return summary;
}

function styleSheet(sheet) {
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF101828' } };
  sheet.getRow(1).alignment = { vertical: 'middle' };
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE4E7EC' } },
        left: { style: 'thin', color: { argb: 'FFE4E7EC' } },
        bottom: { style: 'thin', color: { argb: 'FFE4E7EC' } },
        right: { style: 'thin', color: { argb: 'FFE4E7EC' } }
      };
    });
  });
}

function normalizeHeader(value) {
  return String(value?.text || value || '')
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, '')
    .replace(/[\s_-]+/g, '');
}

function normalizeProductCode(value) {
  const raw = String(value?.text || value || '').trim();
  if (!raw) {
    return '';
  }
  return raw.replace(/\.0$/, '');
}

function timestamp() {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

