import { webkit } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Ubuntu's bundled launcher overwrites LD_LIBRARY_PATH and its ldconfig-cache
// validation ignores Nix paths. Use the same official WPE binary with an
// explicit native dependency preflight, not a different browser or skipped test.
const root = dirname(webkit.executablePath());
const bundle = `${root}/minibrowser-wpe`;
const libraries = `${bundle}/lib:${bundle}/sys/lib:${process.env.LD_LIBRARY_PATH ?? ''}`;
const binary = `${bundle}/bin/MiniBrowser`;
const preflight = spawnSync('ldd', [binary], {
  encoding: 'utf8',
  env: { ...process.env, LD_LIBRARY_PATH: libraries },
});
if (preflight.status !== 0 || preflight.stdout.includes('not found')) {
  throw new Error(
    `WebKit native preflight failed:\n${preflight.stdout}\n${preflight.stderr}`,
  );
}
const dlopen = spawnSync(
  'python3',
  [
    '-c',
    'import ctypes; ctypes.CDLL("libGLESv2.so.2"); ctypes.CDLL("libx264.so")',
  ],
  {
    encoding: 'utf8',
    env: { ...process.env, LD_LIBRARY_PATH: libraries },
  },
);
if (dlopen.status !== 0)
  throw new Error(`WebKit native dlopen preflight failed:\n${dlopen.stderr}`);
mkdirSync('generated-artifacts/browser-runtime', { recursive: true });
const wrapper = resolve('generated-artifacts/browser-runtime/webkit.sh');
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
writeFileSync(
  wrapper,
  [
    '#!/usr/bin/env bash',
    `export WEBKIT_EXEC_PATH=${quote(`${bundle}/bin`)}`,
    `export WEBKIT_INJECTED_BUNDLE_PATH=${quote(`${bundle}/lib`)}`,
    `export WEBKIT_INSPECTOR_RESOURCES_PATH=${quote(`${bundle}/share`)}`,
    `export LD_LIBRARY_PATH=${quote(libraries)}`,
    `exec ${quote(binary)} "$@"`,
    '',
  ].join('\n'),
  { mode: 0o700 },
);
console.info(wrapper);
