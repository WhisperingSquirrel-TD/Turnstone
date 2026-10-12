import { spawnSync } from 'node:child_process';
import { assessAudit } from './audit-policy.ts';

// There are no approved exceptions: Lighthouse's maintained Node API removed
// the vulnerable wrapper. Check every workspace dependency, including dev.
const result = spawnSync('pnpm', ['audit', '--audit-level', 'high', '--json'], {encoding:'utf8'});
let audit;
try { audit = JSON.parse(result.stdout); } catch { audit = undefined; }
const assessment = assessAudit(audit, result.status);
console.info(assessment.summary);
if (!assessment.passed) process.exitCode = 1;
