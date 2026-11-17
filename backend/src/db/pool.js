import pg from 'pg';
import { config } from '../config.js';

// Un pool moderado evita agotar las conexiones de bases administradas.
// Puede ampliarse con DATABASE_POOL_MAX despues de medir la concurrencia.
const poolMax = Number(process.env.DATABASE_POOL_MAX || 10);
const connectionTimeoutMillis = Number(process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS || 15_000);
const ssl = process.env.DATABASE_SSL === 'true'
  ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
  : undefined;

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  options: `-c timezone=${config.appTimezone}`,
  max: poolMax,
  idleTimeoutMillis: 30_000,       // Cerrar conexiones inactivas después de 30s
  connectionTimeoutMillis,
  ssl,
});

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL statement_timeout = 15000'); // 15s timeout
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
