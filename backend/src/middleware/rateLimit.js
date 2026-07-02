import Redis from 'ioredis';
import { AppError } from '../utils/errors.js';

let redisClient = null;
let redisHealthy = false;

if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      retryStrategy: (times) => {
        return Math.min(times * 2000, 10000); // Reintentar de forma espaciada
      }
    });
    redisClient.on('connect', () => {
      redisHealthy = true;
      console.log('Rate Limiter conectado a Redis');
    });
    redisClient.on('error', (err) => {
      redisHealthy = false;
      console.error('Error de conexión a Redis (Rate Limiter):', err.message);
    });
  } catch (error) {
    console.error('No se pudo inicializar el cliente Redis:', error.message);
  }
}

export function createRateLimiter({ windowMs, max, keyPrefix = 'global', keyBuilder = null }) {
  const hits = new Map();

  return async (req, res, next) => {
    const fallbackIp = req.ip || req.connection?.remoteAddress || 'unknown';
    const rawKey = typeof keyBuilder === 'function' ? keyBuilder(req) : fallbackIp;
    const key = `ratelimit:${keyPrefix}:${rawKey || fallbackIp}`;

    // Si Redis está configurado y saludable, lo usamos para el entorno distribuido (Railway)
    if (redisClient && redisHealthy) {
      try {
        const results = await redisClient
          .multi()
          .incr(key)
          .ttl(key)
          .exec();

        const count = results[0][1];
        const ttl = results[1][1];

        // Si es la primera vez que se crea la clave (ttl es -1), le asignamos la expiración correspondiente
        if (ttl === -1) {
          await redisClient.expire(key, Math.ceil(windowMs / 1000));
        }

        if (count > max) {
          const retryAfter = ttl > 0 ? ttl : Math.ceil(windowMs / 1000);
          res.setHeader('Retry-After', String(retryAfter));
          return next(new AppError('Demasiadas solicitudes. Intente nuevamente en unos segundos.', 429));
        }

        return next();
      } catch (error) {
        // Fallback silencioso a memoria si falla Redis
        console.error('Fallo en Redis Rate Limiter, usando fallback en memoria:', error.message);
      }
    }

    // Fallback: Limitador en memoria local (Map)
    const now = Date.now();
    const current = hits.get(key);

    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return next(new AppError('Demasiadas solicitudes. Intente nuevamente en unos segundos.', 429));
    }

    next();
  };
}
