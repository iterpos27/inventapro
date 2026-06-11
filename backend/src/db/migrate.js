import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(dirname, 'migrations');

await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');

const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

for (const file of files) {
  const exists = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
  if (exists.rowCount > 0) {
    continue;
  }

  const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
  await pool.query('BEGIN');
  try {
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    await pool.query('COMMIT');
    console.log(`Migracion aplicada: ${file}`);
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

await pool.end();

