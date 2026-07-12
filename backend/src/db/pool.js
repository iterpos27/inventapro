import pg from 'pg';
import { config } from '../config.js';

// El pool por defecto sólo permite 10 conexiones simultáneas,
// lo que genera cola cuando hay 20-25 operadores contando.
// Aumentamos a 30 (configurable via DATABASE_POOL_MAX) para evitar esperas.
const poolMax = Number(process.env.DATABASE_POOL_MAX || 30);
const connectionTimeoutMillis = Number(process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS || 15_000);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  options: `-c timezone=${config.appTimezone}`,
  max: poolMax,
  idleTimeoutMillis: 30_000,       // Cerrar conexiones inactivas después de 30s
  connectionTimeoutMillis,
});

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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
