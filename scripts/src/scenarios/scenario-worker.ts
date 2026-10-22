import { parentPort, workerData } from 'node:worker_threads';
import { runCompleteGame } from './simulate';
import type { BotStrategy } from './simulate';
import type { GameConfig } from '@workspace/shared';
import type { ScenarioGameProfile } from './report';

export type ScenarioJob = {
  seed: number;
  strategy: BotStrategy;
  config: GameConfig;
  coverageRowId?: string;
};

export type ScenarioWorkerResult = {
  completed: number;
  failures: { seed: number; reason: string }[];
  gameProfiles: ScenarioGameProfile[];
};

type WorkerInput = { jobs: ScenarioJob[] };

function runJobs(jobs: readonly ScenarioJob[]): ScenarioWorkerResult {
  const failures: ScenarioWorkerResult['failures'] = [];
  const profiles = new Map<number, ScenarioGameProfile>();
  for (const job of jobs) {
    const started = performance.now();
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
    } finally {
      const durationMs = Math.max(0, performance.now() - started);
      const players = job.config.players.count;
      const profile = profiles.get(players) ?? {
        players,
        games: 0,
        totalMs: 0,
        maxMs: 0,
      };
      profile.games++;
      profile.totalMs += durationMs;
      profile.maxMs = Math.max(profile.maxMs, durationMs);
      profiles.set(players, profile);
    }
  }
  return {
    completed: jobs.length,
    failures,
    gameProfiles: [...profiles.values()].sort(
      (left, right) => left.players - right.players,
    ),
  };
}

if (!parentPort) throw new Error('Scenario worker requires a parent port');
const port = parentPort;
port.on('message', (jobs: ScenarioJob[]) => {
  port.postMessage(runJobs(jobs));
});
const input = workerData as WorkerInput;
port.postMessage(runJobs(input.jobs));
