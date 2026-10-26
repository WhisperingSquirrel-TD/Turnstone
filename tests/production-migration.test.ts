import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const run = promisify(execFile);
const script = join(process.cwd(), 'lib/db/src/migrate-production.ts');
const tsx = join(process.cwd(), 'node_modules/.bin/tsx');
// An unreachable address with a recognisable password that must never print.
const unreachable = 'postgresql://owner:do-not-print@127.0.0.1:1/oathstone';

async function attempt(env: Record<string, string>) {
  try {
    await run(tsx, [script], {
      env: { PATH: process.env.PATH ?? '', ...env },
      timeout: 20_000,
    });
    return { code: 0, output: '' };
  } catch (error) {
    const failure = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: failure.code ?? 1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    };
  }
}

it('refuses production migrations without the explicit confirmation', async () => {
  const result = await attempt({ DATABASE_URL: unreachable });
  expect(result.code).not.toBe(0);
  expect(result.output).toContain(
    'OATHSTONE_CONFIRM_PRODUCTION_MIGRATION=apply',
  );
  expect(result.output).not.toContain('do-not-print');
});

it('needs a database address and never prints it', async () => {
  const missing = await attempt({
    OATHSTONE_CONFIRM_PRODUCTION_MIGRATION: 'apply',
  });
  expect(missing.code).not.toBe(0);
  expect(missing.output).toContain('DATABASE_URL');

  const unreachableResult = await attempt({
    OATHSTONE_CONFIRM_PRODUCTION_MIGRATION: 'apply',
    DATABASE_URL: unreachable,
  });
  expect(unreachableResult.code).not.toBe(0);
  expect(unreachableResult.output).not.toContain('do-not-print');
});
