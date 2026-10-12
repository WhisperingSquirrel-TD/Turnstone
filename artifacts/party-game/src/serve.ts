import path from 'node:path';
import { createWebApp } from './web-app';

const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Missing or invalid environment variable: PORT');
createWebApp(path.resolve(import.meta.dirname, '../dist/public')).listen(
  port,
  '0.0.0.0',
);
