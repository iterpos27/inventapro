import { AppError } from '../utils/errors.js';

export function createRateLimiter({ windowMs, max, keyPrefix = 'global' }) {
  const hits = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const current = hits.get(key);

    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    current.count += 1;
    if (current.count > max) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      next(new AppError('Demasiadas solicitudes. Intente nuevamente en unos segundos.', 429));
      return;
    }

    next();
  };
}
