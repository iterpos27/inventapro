import 'dotenv/config';

const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET || (isProduction ? '' : 'dev_secret_change_me');

if (isProduction && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET debe estar definido y tener al menos 32 caracteres en produccion');
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/inventapro',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  frontendUrl: process.env.FRONTEND_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:5173'),
  trustProxy: process.env.TRUST_PROXY === 'true',
  enableMobileApi: process.env.ENABLE_MOBILE_API === 'true',
  jsonLimit: process.env.JSON_LIMIT || '2mb',
  seedAdminUser: process.env.APP_SEED_ADMIN_USER || '',
  seedAdminPassword: process.env.APP_SEED_ADMIN_PASSWORD || ''
};
