import { expect, it } from 'vitest';
import fc from 'fast-check';
import { planSchedule } from '../lib/engine/src/index';
import { gameConfigSchema } from '../lib/shared/src/index';

const playerSettings = fc.integer({ min: 5, max: 40 }).chain((players) =>
  fc.record({
    players: fc.constant(players),
    traitors: fc.integer({ min: 1, max: Math.min(8, players - 1) }),
    finalSize: fc.integer({
      min: 3,
      max: Math.min(8, players - 1),
    }),
  }),
);

it('keeps estimated plans inside windows, clear of blocks and at their target size', () => {
  fc.assert(
    fc.property(playerSettings, ({ players, traitors, finalSize }) => {
      const blocked = [
        {
          start: '2027-06-12T10:00:00.000Z',
          end: '2027-06-12T10:30:00.000Z',
        },
      ];
      const config = gameConfigSchema.parse({
        players: { count: players },
        traitors: { number: traitors },
        endgame: { size: finalSize },
        schedule: {
          format: 'quick',
          window: {
            start: '2027-06-12T09:00:00.000Z',
            end: '2027-06-26T09:00:00.000Z',
          },
          blocked,
          quiet: [{ start: '22:00', end: '08:00' }],
        },
      });
      const result = planSchedule(config, { timeZone: 'Europe/London' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const blockedStart = Date.parse(blocked[0]!.start);
      const blockedEnd = Date.parse(blocked[0]!.end);
      for (const plan of result.plans) {
        expect(plan.isEstimate).toBe(true);
        expect(plan.complete).toBe(true);
        expect(plan.fits).toBe(true);
        expect(plan.finalSize).toBeLessThanOrEqual(8);
        expect(plan.steps.at(-1)?.kind).toBe('ENDGAME');
        expect(plan.steps.at(-1)?.playersRemaining).toBe(plan.finalSize);

        let previousEnd = Date.parse(config.schedule.window!.start);
        for (const step of plan.steps) {
          const start = Date.parse(step.start);
          const end = Date.parse(step.end);
          expect(start).toBeGreaterThanOrEqual(previousEnd);
          expect(end).toBeGreaterThan(start);
          expect(step.playersRemaining).toBeGreaterThanOrEqual(plan.finalSize);
          expect(step.playersRemaining).toBeLessThanOrEqual(players);
          expect(end <= blockedStart || start >= blockedEnd).toBe(true);
          previousEnd = end;
        }
      }
    }),
    { numRuns: 80, seed: 20261013 },
  );
});
