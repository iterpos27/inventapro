import { runMigrations } from './db/migrate.js';
import { seedAdmin } from './db/seed.js';

await runMigrations();
await seedAdmin();
await import('./server.js');
