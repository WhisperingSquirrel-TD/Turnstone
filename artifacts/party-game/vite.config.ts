import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { noncePlugin } from './vite.security';

const port = Number(process.env.PORT);
const basePath = process.env.BASE_PATH;
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Missing or invalid environment variable: PORT');
if (!basePath?.startsWith('/'))
  throw new Error('Missing or invalid environment variable: BASE_PATH');

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss(), noncePlugin()],
  html: { cspNonce: '__RESPONSE_NONCE__' },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
    dedupe: ['react', 'react-dom'],
  },
  root: import.meta.dirname,
  build: { outDir: 'dist/public', emptyOutDir: true },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: { strict: true },
  },
});
