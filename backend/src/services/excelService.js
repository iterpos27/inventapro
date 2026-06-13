import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
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
  rows.forEach((row) => sheet.addRow(excelSafeRow(row)));
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
    ...usuarios.map((usuario) => ({ header: excelSafeValue(usuario.nombre), key: `usuario_${usuario.id}`, width: 18 })),
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
    sheet.addRow(excelSafeRow(row));
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
  try {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (!['.xlsx', '.csv'].includes(extension)) {
      throw new AppError('Formato no permitido. Use .xlsx o .csv', 422);
    }

    const headerInfo = extension === '.csv'
      ? await readCsvHeaders(file.path)
      : await readXlsxHeaders(file.path);
    const { headers, totalRows } = headerInfo;
    const codigoCol = headers.codigo;
    const descripcionCol = headers.descripcion;
    if (!codigoCol || !descripcionCol) {
      throw new AppError('Columnas requeridas no encontradas: codigo, descripcion', 422);
    }

    return await withTransaction(async (db) => {
      const job = await db.query(
        `INSERT INTO import_jobs
          (usuario_id, archivo, nombre_original, extension, codigo_col, descripcion_col, total_rows, estado, actualizado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'procesando',NOW())
         RETURNING id`,
        [userId, file.path, file.originalname, extension.slice(1), codigoCol, descripcionCol, totalRows]
      );
      const counters = extension === '.csv'
        ? await importCsvProducts(db, file.path, codigoCol, descripcionCol)
        : await importXlsxProducts(db, file.path, codigoCol, descripcionCol);
      await db.query(
        `UPDATE import_jobs
         SET current_row = $1, procesados = $2, insertados = $3, actualizados = $4, omitidos = $5,
             estado = 'finalizado', actualizado_en = NOW(), finalizado_en = NOW()
         WHERE id = $6`,
        [
          counters.rowsRead + 2,
          counters.procesados,
          counters.insertados,
          0,
          counters.omitidos,
          job.rows[0].id
        ]
      );
      return {
        job_id: Number(job.rows[0].id),
        procesados: counters.procesados,
        insertados: counters.insertados,
        actualizados: 0,
        omitidos: counters.omitidos
      };
    });
  } finally {
    if (file?.path) {
      await fs.unlink(file.path).catch(() => {});
    }
  }
}

async function readCsvHeaders(filePath) {
  const rl = readline.createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  let rowNumber = 0;
  let headers = null;
  for await (const line of rl) {
    rowNumber += 1;
    if (rowNumber === 1) {
      headers = headersFromValues(parseCsvLine(line));
    }
  }
  if (!headers) {
    throw new AppError('Archivo sin datos', 422);
  }
  return { headers, totalRows: rowNumber };
}

async function readXlsxHeaders(filePath) {
  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: 'emit',
    sharedStrings: 'cache',
    styles: 'ignore',
    hyperlinks: 'ignore',
    worksheets: 'emit'
  });
  for await (const worksheetReader of workbookReader) {
    let totalRows = 0;
    let headers = null;
    for await (const row of worksheetReader) {
      totalRows = Math.max(totalRows, row.number || totalRows + 1);
      if (row.number === 1) {
        headers = headersFromRow(row);
      }
    }
    if (!headers || totalRows < 2) {
      throw new AppError('Archivo sin datos', 422);
    }
    return { headers, totalRows };
  }
  throw new AppError('Archivo sin datos', 422);
}

async function importCsvProducts(db, filePath, codigoCol, descripcionCol) {
  const rl = readline.createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  const counters = createImportCounters();
  const batch = [];
  for await (const line of rl) {
    counters.rowsRead += 1;
    if (counters.rowsRead === 1) continue;
    const values = parseCsvLine(line);
    addProductToBatch(values[codigoCol - 1], values[descripcionCol - 1], batch, counters);
    if (batch.length >= 1000) {
      await flushProductImportBatch(db, batch, counters);
    }
  }
  await flushProductImportBatch(db, batch, counters);
  counters.rowsRead = Math.max(0, counters.rowsRead - 1);
  return counters;
}

async function importXlsxProducts(db, filePath, codigoCol, descripcionCol) {
  const counters = createImportCounters();
  const batch = [];
  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: 'emit',
    sharedStrings: 'cache',
    styles: 'ignore',
    hyperlinks: 'ignore',
    worksheets: 'emit'
  });
  let processedFirstSheet = false;
  for await (const worksheetReader of workbookReader) {
    if (processedFirstSheet) break;
    processedFirstSheet = true;
    for await (const row of worksheetReader) {
      if (row.number === 1) continue;
      counters.rowsRead += 1;
      addProductToBatch(row.getCell(codigoCol).value, row.getCell(descripcionCol).value, batch, counters);
      if (batch.length >= 1000) {
        await flushProductImportBatch(db, batch, counters);
      }
    }
  }
  await flushProductImportBatch(db, batch, counters);
  return counters;
}

function createImportCounters() {
  return { rowsRead: 0, procesados: 0, insertados: 0, omitidos: 0 };
}

function addProductToBatch(codigoValue, descripcionValue, batch, counters) {
  const codigo = normalizeProductCode(codigoValue);
  const descripcion = normalizeCellText(descripcionValue);
  if (!codigo || !descripcion) {
    counters.omitidos += 1;
    return;
  }
  counters.procesados += 1;
  batch.push({ codigo, descripcion });
}

async function flushProductImportBatch(db, batch, counters) {
  if (!batch.length) return;
  const codes = [];
  const descriptions = [];
  for (const product of batch.splice(0)) {
    codes.push(product.codigo);
    descriptions.push(product.descripcion);
  }
  const result = await db.query(
    `INSERT INTO productos (codigo, descripcion, estado)
     SELECT codigo, descripcion, TRUE
     FROM UNNEST($1::text[], $2::text[]) AS incoming(codigo, descripcion)
     ON CONFLICT (codigo) DO NOTHING`,
    [codes, descriptions]
  );
  counters.insertados += result.rowCount;
  counters.omitidos += codes.length - result.rowCount;
}

function headersFromRow(row) {
  const headers = {};
  row.eachCell((cell, colNumber) => {
    const key = normalizeHeader(cell.value);
    if (key) {
      headers[key] = colNumber;
    }
  });
  return headers;
}

function headersFromValues(values) {
  return values.reduce((headers, value, index) => {
    const key = normalizeHeader(value);
    if (key) {
      headers[key] = index + 1;
    }
    return headers;
  }, {});
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
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

function normalizeCellText(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (value.text != null) return String(value.text).trim();
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text || '').join('').trim();
    }
    if (value.result != null) return String(value.result).trim();
  }
  return String(value).trim();
}

function excelSafeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, excelSafeValue(value)]));
}

function excelSafeValue(value) {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}
