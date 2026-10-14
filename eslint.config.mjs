import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/generated/**', '**/components/ui/**', 'generated-artifacts/**', '.local/**', '.agents/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', document: 'readonly', window: 'readonly', URL: 'readonly', setTimeout: 'readonly' } },
  },
  {
    files: ['artifacts/party-game/public/service-worker*.js'],
    languageOptions: {
      globals: {
        caches: 'readonly',
        fetch: 'readonly',
        importScripts: 'readonly',
        self: 'readonly',
        URL: 'readonly',
      },
    },
  },
);
