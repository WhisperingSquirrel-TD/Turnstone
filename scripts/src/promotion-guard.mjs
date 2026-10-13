import { execFileSync } from 'node:child_process';
import { canPromote } from './promotion-policy.mjs';

const sha = process.env.VERIFIED_SHA;
if (!sha || !/^[a-f0-9]{40}$/.test(sha))
  throw new Error('Invalid verified commit');
const message = execFileSync(
  'git',
  ['show', '--no-patch', '--format=%B', sha],
  { encoding: 'utf8' },
);
// Honour the owner's latest main-branch freeze, even when an older run finishes.
const ranges = JSON.parse(
  execFileSync('git', ['show', 'origin/main:.github/change-freeze.json'], {
    encoding: 'utf8',
  }),
);
if (!canPromote(ranges, message, new Date().toISOString().slice(0, 10)))
  throw new Error('Promotion refused during change freeze');
console.info('Change-freeze check passed');
