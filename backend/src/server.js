import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { closeExpiredTomas } from './services/conteoService.js';

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`InventaPro API en http://localhost:${config.port}`);
});

let closingExpiredTomas = false;
async function runTomaCloser() {
  if (closingExpiredTomas) return;
  closingExpiredTomas = true;
  try {
    await closeExpiredTomas(pool);
  } catch (error) {
    console.error('No se pudieron cerrar las tomas vencidas:', error);
  } finally {
    closingExpiredTomas = false;
  }
}

const tomaCloserTimer = setInterval(runTomaCloser, config.tomaCloseIntervalMs);
tomaCloserTimer.unref();
runTomaCloser();

async function shutdown(signal) {
  console.log(`${signal} recibido. Cerrando InventaPro...`);
  clearInterval(tomaCloserTimer);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
