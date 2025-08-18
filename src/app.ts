import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import routes from './routes';
import { Env } from './config/env';
import { errorHandler } from './middleware/error';

export function createApp() {
  const app = express();

  // Basic request log (optional)
  // app.use((req, _res, next) => { console.log('INCOMING', req.method, req.url); next(); });

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: Env.CORS_ORIGIN.length ? Env.CORS_ORIGIN : '*' }));
  app.use(compression());
  app.use(express.json({ limit: '64kb' }));
  app.use('/api/', rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true }));

  app.use('/api', routes);

  // 404
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // Error middleware
  app.use(errorHandler);

  return app;
}
