import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultSourceDir = path.resolve(dirname, '../../../migration/mysql-export');
const knownTables = [
  'usuarios',
  'productos',
  'agencias',
  'tomas_fisicas',
  'toma_usuarios',
  'conteos',
  'conteo_detalle',
  'api_tokens',
  'login_attempts'
];
const booleanColumns = {
  usuarios: ['estado'],
  productos: ['estado'],
  agencias: ['estado'],
  api_tokens: ['revocado']
};

function parseArgs(argv) {
  const options = {
    sourceDir: process.env.MYSQL_EXPORT_DIR || defaultSourceDir,
    truncate: false,
    dryRun: false
  };
  for (const arg of argv) {
    if (arg === '--truncate') options.truncate = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--source=')) options.sourceDir = path.resolve(arg.slice('--source='.length));
  }
  return options;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return false;
  return ['1', 'true', 't', 'yes', 'si'].includes(raw);
}

export function normalizeRow(table, row) {
  const next = { ...row };
  for (const column of booleanColumns[table] || []) {
    if (column in next) {
      next[column] = toBoolean(next[column]);
    }
  }
  return next;
}

async function loadTableRows(sourceDir, table) {
  const file = path.join(sourceDir, `${table}.json`);
  const raw = await fs.readFile(file, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error(`El archivo ${file} debe contener un arreglo JSON`);
  }
  return data.map((row) => normalizeRow(table, row));
}

async function resetSequence(client, table) {
  await client.query(
    `SELECT setval(
       pg_get_serial_sequence($1, 'id'),
       COALESCE((SELECT MAX(id) FROM ${table}), 1),
       (SELECT COUNT(*) > 0 FROM ${table})
     )`,
    [table]
  ).catch(() => {});
}

async function insertRows(client, table, rows) {
  let inserted = 0;
  let omitted = 0;
  const errors = [];
  for (const row of rows) {
    const columns = Object.keys(row);
    if (!columns.length) {
      omitted += 1;
      continue;
    }
    const values = columns.map((column) => row[column]);
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    try {
      await client.query(sql, values);
      inserted += 1;
    } catch (error) {
      errors.push({ table, row, message: error.message });
    }
  }
  return { inserted, omitted, errors };
}

export async function migrateFromMysqlJson(options = {}) {
  const { sourceDir = defaultSourceDir, truncate = false, dryRun = false } = options;
  const report = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const table of knownTables) {
      const file = path.join(sourceDir, `${table}.json`);
      try {
        await fs.access(file);
      } catch {
        report.push({ table, inserted: 0, omitted: 0, errors: 0, skipped: true });
        continue;
      }
      const rows = await loadTableRows(sourceDir, table);
      if (truncate && !dryRun) {
        await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
      }
      if (dryRun) {
        report.push({ table, inserted: rows.length, omitted: 0, errors: 0, skipped: false, dryRun: true });
        continue;
      }
      const result = await insertRows(client, table, rows);
      await resetSequence(client, table);
      report.push({
        table,
        inserted: result.inserted,
        omitted: result.omitted,
        errors: result.errors.length,
        skipped: false
      });
      if (result.errors.length) {
        await client.query('ROLLBACK');
        return { ok: false, sourceDir, report, sampleErrors: result.errors.slice(0, 5) };
      }
    }
    await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
    return { ok: true, sourceDir, report };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const options = parseArgs(process.argv.slice(2));
  const result = await migrateFromMysqlJson(options);
  console.log(JSON.stringify(result, null, 2));
  await pool.end();
  if (!result.ok) {
    process.exitCode = 1;
  }
}
