import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { AppError } from '../utils/errors.js';
import { roleCan } from '../utils/roles.js';
import { sha256 } from '../utils/hash.js';
import { sessionVersionMatches } from '../utils/session.js';

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export async function requireWebUser(req, res, next) {
  try {
    const token = bearerToken(req);
    if (!token) {
      throw new AppError('Token requerido', 401);
    }
    const payload = jwt.verify(token, config.jwtSecret);

    // Verificar que el token no ha sido revocado (blacklist de logout)
    if (payload.jti) {
      const revoked = await pool.query(
        'SELECT 1 FROM revoked_tokens WHERE jti = $1 AND expira_en > NOW() LIMIT 1',
        [payload.jti]
      );
      if (revoked.rowCount > 0) {
        throw new AppError('Sesion cerrada. Inicie sesion nuevamente.', 401);
      }
    }

    const { rows } = await pool.query(
      'SELECT id, nombre, usuario, rol, auth_version FROM usuarios WHERE id = $1 AND estado = TRUE LIMIT 1',
      [payload.sub]
    );
    if (!rows[0]) {
      throw new AppError('Token invalido', 401);
    }
    if (!sessionVersionMatches(payload.ver, rows[0].auth_version)) {
      throw new AppError('Sesion vencida. Inicie sesion nuevamente.', 401);
    }
    req.user = rows[0];
    req.tokenPayload = payload;
    next();
  } catch (error) {
    next(error.status ? error : new AppError('Token invalido', 401));
  }
}

export async function requireApiUser(req, res, next) {
  try {
    const token = bearerToken(req);
    if (!token) {
      throw new AppError('Token requerido', 401);
    }
    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, u.usuario, u.rol
       FROM api_tokens t
       INNER JOIN usuarios u ON u.id = t.usuario_id
       WHERE t.token_hash = $1
         AND t.revocado = FALSE
         AND t.fecha_expiracion > NOW()
         AND u.estado = TRUE
       LIMIT 1`,
      [sha256(token)]
    );
    if (!rows[0]) {
      throw new AppError('Token invalido', 401);
    }
    if (!roleCan(rows[0].rol, 'api_count')) {
      throw new AppError('Disponible solo para usuarios de conteo', 403);
    }
    req.user = rows[0];
    req.apiToken = token;
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user || !roleCan(req.user.rol, permission)) {
      next(new AppError('No autorizado', 403));
      return;
    }
    next();
  };
}
