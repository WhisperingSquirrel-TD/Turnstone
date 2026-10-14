import { spawnSync } from 'node:child_process';
import { browserPlan } from './browser-plan.mjs';

const plan = browserPlan(process.env.CI === 'true');
if (plan.notice) console.info(plan.notice);
function runPlaywright(args) {
  const result =
    process.env.CI === 'true'
      ? spawnSync('pnpm', args, { stdio: 'inherit' })
      : spawnSync('bash', ['scripts/browser-runtime.sh', 'pnpm', ...args], {
          stdio: 'inherit',
        });
  return result.status ?? 1;
}

const args = [
  'exec',
  'playwright',
  'test',
  ...plan.projects.map((name) => `--project=${name}`),
  '--grep-invert',
  '@rehearsal-live',
];
const smokeStatus = runPlaywright(args);
process.exitCode =
  smokeStatus === 0
    ? runPlaywright([
        'exec',
        'playwright',
        'test',
        '--config=playwright.rehearsal.config.ts',
      ])
    : smokeStatus;
