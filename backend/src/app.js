import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { mobileApi } from './routes/mobileApi.js';
import { webApi } from './routes/webApi.js';
import { errorHandler, notFound } from './utils/errors.js';

export const app = express();

if (config.trustProxy) {
  app.set('trust proxy', 1);
}

const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: 'login' });
const searchLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 180, keyPrefix: 'search' });
const importLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 6, keyPrefix: 'import' });

app.use(helmet());
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json({ limit: config.jsonLimit }));
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'inventapro-backend' });
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

app.use('/api/admin', webApi);

app.use(notFound);
app.use(errorHandler);
