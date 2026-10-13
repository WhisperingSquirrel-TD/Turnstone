import { spawnSync } from 'node:child_process';
import { browserPlan } from './browser-plan.mjs';

const plan = browserPlan(process.env.CI === 'true');
if (plan.notice) console.info(plan.notice);
const args = [
  'exec',
  'playwright',
  'test',
  ...plan.projects.map((name) => `--project=${name}`),
];
const result =
  process.env.CI === 'true'
    ? spawnSync('pnpm', args, { stdio: 'inherit' })
    : spawnSync('bash', ['scripts/browser-runtime.sh', 'pnpm', ...args], {
        stdio: 'inherit',
      });
process.exitCode = result.status ?? 1;
