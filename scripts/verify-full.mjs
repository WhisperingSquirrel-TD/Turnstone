import { writeFile } from 'node:fs/promises';

await writeFile('docs/SCENARIO_REPORT.md', `# Scenario report

Status: NOT RUN — full game scenarios are not implemented in Milestone 0.

The infrastructure verify gate passed before this placeholder ran.
Milestone 2 will replace this script with the real scenario harness.
No gameplay, fuzzing, reference implementation or exhaustive sweeps have run.
`);
console.log('Full scenario verification is unavailable until Milestone 2.');
// A placeholder must never claim the full game passed.
process.exitCode = 1;
