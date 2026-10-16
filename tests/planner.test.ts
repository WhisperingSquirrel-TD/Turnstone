import { expect, it } from 'vitest';
import { planSchedule } from '../lib/engine/src/index';
import { gameConfigSchema } from '../lib/shared/src/index';

type ConfigOverrides = {
  players?: number;
  traitors?: number | 'auto';
  finalSize?: number | 'auto';
  format?: 'quick' | 'day' | 'multi-day';
  start?: string;
  end?: string;
  blocked?: { start: string; end: string }[];
  quiet?: { start: string; end: string }[];
  missions?: boolean;
  banishments?: number;
};

function makeConfig(overrides: ConfigOverrides = {}) {
  return gameConfigSchema.parse({
    players: { count: overrides.players ?? 15 },
    traitors: { number: overrides.traitors ?? 3 },
    endgame: { size: overrides.finalSize ?? 4 },
    missions: { enabled: overrides.missions ?? true },
    roundTable: { banishments: overrides.banishments ?? 1 },
    schedule: {
      format: overrides.format ?? 'day',
      window: {
        start: overrides.start ?? '2027-06-12T09:00:00.000Z',
        end: overrides.end ?? '2027-06-12T20:00:00.000Z',
      },
      blocked: overrides.blocked ?? [
        {
          start: '2027-06-12T12:00:00.000Z',
          end: '2027-06-12T13:30:00.000Z',
        },
        {
          start: '2027-06-12T14:00:00.000Z',
          end: '2027-06-12T14:15:00.000Z',
        },
      ],
      quiet: overrides.quiet ?? [],
    },
  });
}

function requirePlans(result: ReturnType<typeof planSchedule>) {
  if (!result.ok) throw new Error(`Expected a schedule, got ${result.code}`);
  return result;
}

function getStandardPlan(result: ReturnType<typeof planSchedule>) {
  const plan = requirePlans(result).plans.find(
    (candidate) => candidate.variant === 'Standard',
  );
  if (!plan) throw new Error('Standard plan is missing');
  return plan;
}

it('plans the 15-player day without entering blocked windows and labels it an estimate', () => {
  const result = requirePlans(
    planSchedule(makeConfig(), { timeZone: 'Europe/London' }),
  );
  const standard = getStandardPlan(result);
  const blocked = makeConfig().schedule.blocked.map((window) => ({
    start: Date.parse(window.start),
    end: Date.parse(window.end),
  }));

  expect(result.cycles).toBe(6);
  expect(result.plans.map((plan) => plan.variant)).toEqual([
    'Relaxed',
    'Standard',
    'Compressed',
  ]);
  expect(standard.fits).toBe(true);
  expect(standard.isEstimate).toBe(true);
  expect(standard.complete).toBe(true);
  expect(standard.steps[0]?.kind).toBe('DEAL');
  expect(standard.steps.at(-1)).toMatchObject({
    kind: 'ENDGAME',
    playersRemaining: 4,
  });
  expect(standard.steps.some((step) => step.kind === 'MISSION')).toBe(true);

  for (const step of standard.steps) {
    const start = Date.parse(step.start);
    const end = Date.parse(step.end);
    expect(end).toBeGreaterThan(start);
    expect(
      blocked.every((window) => end <= window.start || start >= window.end),
    ).toBe(true);
  }
});

it('uses the Quick format duration defaults and supports the minimum seat count', () => {
  const result = requirePlans(
    planSchedule(
      makeConfig({
        players: 5,
        traitors: 1,
        finalSize: 3,
        format: 'quick',
        start: '2027-06-12T09:00:00.000Z',
        end: '2027-06-12T10:00:00.000Z',
        blocked: [],
        missions: false,
      }),
      { timeZone: 'Europe/London' },
    ),
  );
  const standard = getStandardPlan(result);
  const deal = standard.steps.find((step) => step.kind === 'DEAL');

  expect(deal).toBeDefined();
  expect(Date.parse(deal!.end) - Date.parse(deal!.start)).toBe(3 * 60 * 1000);
  expect(standard.steps.at(-1)?.playersRemaining).toBe(3);
  expect(standard.steps.map((step) => step.kind)).not.toContain('SEER');
});

it('reports the required minimum time when even the compressed plan cannot fit', () => {
  const result = planSchedule(
    makeConfig({
      players: 5,
      traitors: 1,
      finalSize: 3,
      format: 'quick',
      start: '2027-06-12T09:00:00.000Z',
      end: '2027-06-12T09:10:00.000Z',
      blocked: [],
      missions: false,
    }),
    { timeZone: 'Europe/London' },
  );

  expect(result).toMatchObject({ ok: false, code: 'WINDOW_TOO_SHORT' });
  if (result.ok) throw new Error('Expected a too-short-window result');
  expect(result.minimumMinutes).toBeGreaterThan(result.availableMinutes);
});

it('applies compression in the documented order and stops once it fits', () => {
  const result = requirePlans(
    planSchedule(
      makeConfig({
        start: '2027-06-12T09:00:00.000Z',
        end: '2027-06-12T16:00:00.000Z',
      }),
      { timeZone: 'Europe/London' },
    ),
  );
  const standard = getStandardPlan(result);
  const compressed = result.plans.find((plan) => plan.variant === 'Compressed');

  expect(standard.fits).toBe(false);
  expect(compressed?.fits).toBe(true);
  expect(compressed?.adjustments).toEqual([
    'Debates shortened to the two-minute minimum.',
    'Missions dropped after cycle one.',
  ]);
});

it('never compresses a plan by scheduling two banishments in one cycle', () => {
  const result = requirePlans(
    planSchedule(
      makeConfig({
        start: '2027-06-12T09:00:00.000Z',
        end: '2027-06-12T12:15:00.000Z',
        blocked: [],
      }),
      { timeZone: 'Europe/London' },
    ),
  );
  const compressed = result.plans.find((plan) => plan.variant === 'Compressed');
  if (!compressed) throw new Error('Compressed plan is missing');
  const votes = compressed.steps.filter((step) => step.kind === 'VOTE');
  const verdicts = compressed.steps.filter((step) => step.kind === 'VERDICT');

  expect(compressed).toMatchObject({
    fits: true,
    cycles: 4,
    finalSize: 5,
    adjustments: [
      'Debates shortened to the two-minute minimum.',
      'Missions dropped after cycle one.',
      'Up to two murders scheduled per cycle.',
      'Final size raised by one player.',
    ],
  });
  expect(verdicts).toHaveLength(votes.length);
  for (const verdict of verdicts) {
    const vote = votes.find((step) => step.cycle === verdict.cycle);
    expect(vote).toBeDefined();
    expect(
      vote!.playersRemaining - verdict.playersRemaining,
    ).toBeLessThanOrEqual(1);
  }
});

it('caps a configured two-banishment setting until engine support exists', () => {
  const result = requirePlans(
    planSchedule(makeConfig({ players: 15, banishments: 2, blocked: [] }), {
      timeZone: 'Europe/London',
    }),
  );

  for (const plan of result.plans) {
    const votes = plan.steps.filter((step) => step.kind === 'VOTE');
    const verdicts = plan.steps.filter((step) => step.kind === 'VERDICT');
    expect(verdicts).toHaveLength(votes.length);
    for (const verdict of verdicts) {
      const vote = votes.find((step) => step.cycle === verdict.cycle);
      expect(vote).toBeDefined();
      expect(
        vote!.playersRemaining - verdict.playersRemaining,
      ).toBeLessThanOrEqual(1);
    }
    expect(plan.warnings).toContain(
      'Only one banishment per round is estimated until engine support is added.',
    );
  }
});

it('includes configuration balance warnings with every plan option', () => {
  const result = requirePlans(
    planSchedule(
      makeConfig({
        players: 15,
        traitors: 6,
        finalSize: 8,
        blocked: [],
      }),
    ),
  );

  for (const plan of result.plans) {
    expect(plan.warnings).toContain('Traitors exceed 30% of the seats.');
    expect(plan.warnings).toContain(
      'Final size is greater than half of the seats.',
    );
    expect(plan.warnings).toContain(
      'There are fewer planned cycles than Traitors.',
    );
  }
});

it('uses spare time for one extra mission in the Relaxed option', () => {
  const result = requirePlans(
    planSchedule(
      makeConfig({
        start: '2027-06-12T09:00:00.000Z',
        end: '2027-06-26T09:00:00.000Z',
        blocked: [],
      }),
      { timeZone: 'Europe/London' },
    ),
  );
  const relaxed = result.plans.find((plan) => plan.variant === 'Relaxed');
  const standard = getStandardPlan(result);

  expect(relaxed?.steps.filter((step) => step.kind === 'MISSION')).toHaveLength(
    standard.steps.filter((step) => step.kind === 'MISSION').length + 1,
  );
  expect(relaxed?.adjustments).toContain(
    'One additional mission scheduled because the window allows.',
  );
});

it('adds a banishment-only half-cycle for an odd elimination target', () => {
  const result = requirePlans(
    planSchedule(
      makeConfig({ players: 6, traitors: 1, finalSize: 3, blocked: [] }),
      { timeZone: 'Europe/London' },
    ),
  );
  const standard = getStandardPlan(result);

  expect(result.cycles).toBe(2);
  expect(standard.steps.filter((step) => step.kind === 'VOTE')).toHaveLength(2);
  expect(
    standard.steps.filter(
      (step) => step.kind === 'MISSION' && step.cycle === 2,
    ),
  ).toHaveLength(0);
  expect(standard.steps.filter((step) => step.kind === 'DAWN')).toHaveLength(1);
  expect(standard.steps.at(-1)?.kind).toBe('ENDGAME');
  expect(standard.steps.at(-1)?.playersRemaining).toBe(3);
});

it('keeps UTC instants stable through a clock change and includes a scheduled departure', () => {
  const result = requirePlans(
    planSchedule(
      makeConfig({
        players: 5,
        traitors: 1,
        finalSize: 3,
        format: 'multi-day',
        start: '2027-03-27T10:00:00.000Z',
        end: '2027-04-10T09:00:00.000Z',
        blocked: [],
        quiet: [{ start: '22:00', end: '08:00' }],
        missions: false,
      }),
      {
        timeZone: 'Europe/London',
        seatLeaveTimes: [{ seatId: 'seat-5', at: '2027-03-28T07:15:00.000Z' }],
      },
    ),
  );
  const standard = getStandardPlan(result);
  const deal = standard.steps.find((step) => step.kind === 'DEAL');
  const departure = standard.steps.find((step) => step.kind === 'DEPARTURE');

  expect(deal).toBeDefined();
  expect(Date.parse(deal!.end) - Date.parse(deal!.start)).toBe(
    12 * 60 * 60 * 1000,
  );
  expect(departure).toMatchObject({
    start: '2027-03-28T07:15:00.000Z',
    playersRemaining: 4,
  });
  expect(
    standard.warnings.some((warning) => warning.includes('estimate')),
  ).toBe(true);

  const quietWindow = {
    start: Date.parse('2027-03-27T22:00:00.000Z'),
    end: Date.parse('2027-03-28T07:00:00.000Z'),
  };
  for (const step of standard.steps) {
    if (step.kind === 'DEPARTURE') continue;
    const start = Date.parse(step.start);
    const end = Date.parse(step.end);
    expect(end <= quietWindow.start || start >= quietWindow.end).toBe(true);
  }
});

it.each([
  [5, 1, 3],
  [7, 1, 3],
  [8, 2, 4],
  [11, 2, 4],
  [12, 3, 4],
  [17, 3, 4],
  [18, 4, 5],
  [24, 4, 5],
  [25, 5, 6],
  [32, 5, 6],
  [33, 6, 6],
  [40, 6, 6],
])(
  'uses the shared recommendation table for %i seats',
  (players, traitors, finalSize) => {
    const result = requirePlans(
      planSchedule(
        makeConfig({
          players,
          traitors: 'auto',
          finalSize: 'auto',
          format: 'quick',
          blocked: [],
        }),
      ),
    );
    expect(result.traitors).toBe(traitors);
    expect(result.finalSize).toBe(finalSize);
  },
);

it('fits a 40-player multi-day game in a 14-day window with a compressed option', () => {
  const result = requirePlans(
    planSchedule(
      makeConfig({
        players: 40,
        traitors: 6,
        finalSize: 6,
        format: 'multi-day',
        start: '2027-03-20T10:00:00.000Z',
        end: '2027-04-03T10:00:00.000Z',
        blocked: [],
      }),
      { timeZone: 'Europe/London' },
    ),
  );

  expect(result.cycles).toBe(17);
  expect(result.plans.find((plan) => plan.variant === 'Compressed')?.fits).toBe(
    true,
  );
});

it('counts heavily blocked time when explaining an insufficient window', () => {
  const result = planSchedule(
    makeConfig({
      players: 5,
      traitors: 1,
      finalSize: 3,
      format: 'quick',
      start: '2027-06-12T09:00:00.000Z',
      end: '2027-06-12T10:00:00.000Z',
      blocked: [
        {
          start: '2027-06-12T09:00:00.000Z',
          end: '2027-06-12T09:59:00.000Z',
        },
      ],
      missions: false,
    }),
  );

  expect(result).toMatchObject({ ok: false, code: 'WINDOW_TOO_SHORT' });
  if (result.ok) throw new Error('Expected a too-short-window result');
  expect(result.availableMinutes).toBe(1);
  expect(result.minimumMinutes).toBeGreaterThan(result.availableMinutes);
});

it('explains when a whole phase cannot fit between quiet hours', () => {
  const result = planSchedule(
    makeConfig({
      players: 5,
      traitors: 1,
      finalSize: 3,
      format: 'multi-day',
      start: '2027-03-20T09:00:00.000Z',
      end: '2027-04-03T09:00:00.000Z',
      blocked: [],
      quiet: [{ start: '16:00', end: '08:00' }],
      missions: false,
    }),
    { timeZone: 'Europe/London' },
  );

  expect(result).toMatchObject({
    ok: false,
    code: 'STEP_CANNOT_FIT',
  });
  if (result.ok) throw new Error('Expected a phase-length error');
  expect(result.minimumMinutes).toBeGreaterThan(0);
});
