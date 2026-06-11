import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { pool } from './pool.js';

if (!config.seedAdminUser || config.seedAdminPassword.length < 12) {
  console.log('Sin APP_SEED_ADMIN_USER o password menor a 12 caracteres. No se creo admin.');
  await pool.end();
  process.exit(0);
}

const passwordHash = await bcrypt.hash(config.seedAdminPassword, 12);
await pool.query(
  `INSERT INTO usuarios (nombre, usuario, password, rol, estado)
   VALUES ($1, $2, $3, 'admin', TRUE)
   ON CONFLICT (usuario) DO NOTHING`,
  ['Administrador', config.seedAdminUser, passwordHash]
);

console.log(`Admin verificado: ${config.seedAdminUser}`);
await pool.end();

