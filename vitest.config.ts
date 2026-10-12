import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'artifacts/party-game/src'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'artifacts/party-game/src/**/*.test.tsx'],
    exclude: ['e2e/**'],
    environment: 'node',
  },
});
