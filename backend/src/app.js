import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { mobileApi } from './routes/mobileApi.js';
import { webApi } from './routes/webApi.js';
import { errorHandler, notFound } from './utils/errors.js';

export const app = express();
const dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(dirname, '../../frontend/dist');
const storagePublic = path.resolve(dirname, '../storage');

if (config.trustProxy) {
  app.set('trust proxy', 1);
}

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyPrefix: 'login',
  keyBuilder: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const usuario = String(req.body?.usuario || '').trim().toLowerCase() || 'anonymous';
    return `${ip}:${usuario}`;
  }
});
// El searchLimiter usa el token de autenticación como clave cuando está disponible.
// Esto evita que 20-25 operadores en la misma red Wi-Fi de bodega sean bloqueados
// juntos al compartir una sola IP pública. Cada operador tiene su propio límite.
const searchLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  keyPrefix: 'search',
  keyBuilder: (req) => {
    const header = req.headers.authorization || '';
    const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (token) return `token:${token.slice(0, 40)}`;
    return req.ip || req.connection?.remoteAddress || 'unknown';
  }
});
const importLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 6, keyPrefix: 'import' });

app.use(helmet());
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json({ limit: config.jsonLimit }));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

app.get('/live', (req, res) => {
  res.json({ ok: true, service: 'inventapro-backend', uptime_seconds: Math.floor(process.uptime()) });
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'inventapro-backend', database: 'ready', uptime_seconds: Math.floor(process.uptime()) });
  } catch (error) {
    console.error('Health check de PostgreSQL fallido:', error);
    res.status(503).json({ ok: false, service: 'inventapro-backend', database: 'unavailable' });
  }
});

app.get('/metrics', async (req, res) => {
  if (config.metricsApiKey) {
    const providedKey = req.query.apiKey || req.headers['x-api-key'] || req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
    if (providedKey !== config.metricsApiKey) {
      return res.status(401).json({ ok: false, message: 'No autorizado' });
    }
  }
  try {
    const [users, tomas, finalizados, logs] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM usuarios WHERE estado = TRUE'),
      pool.query('SELECT COUNT(*)::int AS total FROM tomas_fisicas'),
      pool.query("SELECT COUNT(*)::int AS total FROM conteos WHERE estado = 'finalizado'"),
      pool.query("SELECT COUNT(*)::int AS total FROM app_logs WHERE created_at > NOW() - INTERVAL '24 hours'")
    ]);
    res.json({
      ok: true,
      uptime_seconds: Math.floor(process.uptime()),
      metrics: {
        usuarios_activos: users.rows[0].total,
        tomas_total: tomas.rows[0].total,
        conteos_finalizados: finalizados.rows[0].total,
        eventos_app_24h: logs.rows[0].total
      }
    });
  } catch (error) {
    res.status(503).json({ ok: false, message: 'No se pudieron obtener metricas' });
  }
});

app.use('/api/admin/auth/login', loginLimiter);
app.use('/api/admin/mi/productos', searchLimiter);
app.use('/api/admin/productos/import', importLimiter);

if (config.enableMobileApi) {
  app.use('/api/v1/login', loginLimiter);
  app.use('/api/login', loginLimiter);
  app.use('/api/v1/productos', searchLimiter);
  app.use('/api/productos', searchLimiter);
  app.use('/api/v1', mobileApi);
  app.use('/api', mobileApi);
}

app.use('/storage', express.static(storagePublic, { maxAge: config.nodeEnv === 'production' ? '7d' : 0 }));
app.use('/api/admin', webApi);

if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist, {
    index: false,
    maxAge: config.nodeEnv === 'production' ? '1y' : 0,
    immutable: config.nodeEnv === 'production'
  }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);
