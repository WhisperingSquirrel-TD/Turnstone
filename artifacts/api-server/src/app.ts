import express, { type Express } from 'express';
import {
  HealthCheckResponse,
  ReadinessCheckResponse,
} from '@workspace/api-zod';
import { security } from './middlewares/security';

export function createApp(probeDatabase: () => Promise<void>): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(security);
  app.get(['/api/healthz', '/healthz'], (_req, res) => {
    res.json(HealthCheckResponse.parse({ status: 'ok' }));
  });
  app.get(['/api/readyz', '/readyz'], async (_req, res) => {
    try {
      await probeDatabase();
      res.json(ReadinessCheckResponse.parse({ status: 'ready' }));
    } catch {
      res
        .status(503)
        .json(ReadinessCheckResponse.parse({ status: 'unavailable' }));
    }
  });
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  return app;
}
