import { EventEmitter } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';

const dispatched = vi.hoisted(() => ({
  batches: [] as number[][],
  workers: 0,
  terminated: 0,
  mode: 'normal' as 'normal' | 'error' | 'exit',
}));

vi.mock('node:os', () => ({ availableParallelism: () => 2 }));
vi.mock('node:worker_threads', () => ({
  Worker: class extends EventEmitter {
    constructor(
      _url: URL,
      options: { workerData: { jobs: { seed: number }[] } },
    ) {
      super();
      dispatched.workers++;
      this.postMessage(options.workerData.jobs);
    }
    postMessage(jobs: { seed: number }[]) {
      dispatched.batches.push(jobs.map((job) => job.seed));
      queueMicrotask(() => {
        if (dispatched.mode === 'error') {
          this.emit('error', new Error('deliberate worker error'));
          return;
        }
        if (dispatched.mode === 'exit') {
          this.emit('exit', 0);
          return;
        }
        this.emit('message', {
          completed: jobs.length,
          failures: jobs
            .filter((job) => job.seed === 3)
            .map((job) => ({ seed: job.seed, reason: 'deliberate failure' })),
          gameProfiles: [
            { players: 5, games: jobs.length, totalMs: jobs.length, maxMs: 1 },
          ],
        });
      });
    }
    terminate() {
      dispatched.terminated++;
      return Promise.resolve(0);
    }
  },
}));

import {
  coreConfig,
  runEngineScenarioSuite,
  runScenarioJobs,
} from '../scripts/src/scenarios/runner';

beforeEach(() => {
  dispatched.batches = [];
  dispatched.workers = 0;
  dispatched.terminated = 0;
  dispatched.mode = 'normal';
});

it('feeds each worker another game as soon as it finishes, retaining every result', async () => {
  const config = coreConfig(5, 1, 'quick');
  const jobs = Array.from({ length: 7 }, (_, index) => ({
    seed: index + 1,
    config,
    strategy: 'random' as const,
  }));
  const result = await runScenarioJobs(jobs);
  expect(dispatched.workers).toBe(2);
  expect(dispatched.terminated).toBe(2);
  expect(dispatched.batches).toHaveLength(7);
  expect(dispatched.batches.every((batch) => batch.length === 1)).toBe(true);
  expect(dispatched.batches.flat().sort((a, b) => a - b)).toEqual(
    jobs.map((job) => job.seed),
  );
  expect(result).toEqual({
    completed: 7,
    failureSeeds: [3],
    failures: ['Seed 3: deliberate failure'],
    gameProfiles: [{ players: 5, games: 7, totalMs: 7, maxMs: 1 }],
  });
});

it.each(['error', 'exit'] as const)(
  'rejects an unfinished worker %s and cleans up the entire pool',
  async (mode) => {
    dispatched.mode = mode;
    const jobs = Array.from({ length: 3 }, (_, seed) => ({
      seed,
      strategy: 'random' as const,
      config: coreConfig(5, 1, 'quick'),
    }));
    await expect(runScenarioJobs(jobs)).rejects.toThrow(
      mode === 'error'
        ? 'deliberate worker error'
        : 'Scenario worker exited with code 0',
    );
    expect(dispatched.terminated).toBe(2);
  },
);

it('shares the pool across suites rather than waiting at three worker barriers', async () => {
  const report = await runEngineScenarioSuite({
    mode: 'sample',
    limits: {
      sweepCells: 1,
      coveringRows: 1,
      highSeatRows: 1,
      fuzzGames: 0,
    },
  });
  expect(dispatched.workers).toBe(2);
  expect(dispatched.batches.flat()).toHaveLength(3);
  expect(new Set(dispatched.batches.flat()).size).toBe(3);
  expect(report.failures).toEqual([]);
  expect(report.sweepGames).toBe(1);
  expect(report.coveringGames).toBe(1);
  expect(report.highSeatCoveringGames).toBe(1);
  expect(report.goldenGames).toBe(18);
  expect(report.coverageRowIds).toEqual([
    'core-sweep:0',
    'high-seat-pairwise:0',
    'three-way:0',
  ]);
}, 120_000);
