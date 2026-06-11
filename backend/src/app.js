import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { mobileApi } from './routes/mobileApi.js';
import { webApi } from './routes/webApi.js';
import { errorHandler, notFound } from './utils/errors.js';

export const app = express();

app.use(helmet());
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'inventapro-backend' });
});

app.use('/api/v1', mobileApi);
app.use('/api', mobileApi);
app.use('/api/admin', webApi);

app.use(notFound);
app.use(errorHandler);

