import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db/pool.js';

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`InventaPro API en http://localhost:${config.port}`);
});

async function shutdown(signal) {
  console.log(`${signal} recibido. Cerrando InventaPro...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
