import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { pool } from './pool.js';

export async function seedAdmin() {
  if (!config.seedAdminUser || config.seedAdminPassword.length < 8) {
    console.log('Sin APP_SEED_ADMIN_USER o password menor a 8 caracteres. No se creo admin.');
    return;
  }

  const passwordHash = await bcrypt.hash(config.seedAdminPassword, 12);
  await pool.query(
    `INSERT INTO usuarios (nombre, usuario, password, rol, estado)
     VALUES ($1, $2, $3, 'admin', TRUE)
     ON CONFLICT (usuario) DO NOTHING`,
    ['Administrador', config.seedAdminUser, passwordHash]
  );

  console.log(`Admin verificado: ${config.seedAdminUser}`);
}

if (process.argv[1]?.endsWith('seed.js')) {
  await seedAdmin();
  await pool.end();
}
