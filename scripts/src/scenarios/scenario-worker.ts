import { parentPort, workerData } from 'node:worker_threads';
import { runCompleteGame } from './simulate';
import type { BotStrategy } from './simulate';
import type { GameConfig } from '@workspace/shared';

export type ScenarioJob = {
  seed: number;
  strategy: BotStrategy;
  config: GameConfig;
};

export type ScenarioWorkerResult = {
  completed: number;
  failures: { seed: number; reason: string }[];
};

type WorkerInput = { jobs: ScenarioJob[] };

function runJobs(jobs: readonly ScenarioJob[]): ScenarioWorkerResult {
  const failures: ScenarioWorkerResult['failures'] = [];
  for (const job of jobs) {
    try {
      const result = runCompleteGame(job);
      if (
        !result.checks.referenceMatches ||
        !result.checks.replayMatches ||
        !result.checks.noLeaks
      )
        throw new Error('A required per-game assertion returned false');
    } catch (error) {
      failures.push({
        seed: job.seed,
        reason:
          error instanceof Error ? error.message : 'Unknown scenario failure',
      });
    }
  }
  return { completed: jobs.length, failures };
}

if (!parentPort) throw new Error('Scenario worker requires a parent port');
const input = workerData as WorkerInput;
parentPort.postMessage(runJobs(input.jobs));
