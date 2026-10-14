import { z } from 'zod';

const minutes = (value: number, min = 1, max = 60) =>
  z.number().int().min(min).max(max).default(value);
const taskTagSchema = z.enum([
  'family',
  'office',
  'adults-only',
  'seated',
  'remote-friendly',
]);
export const taskDefinitionSchema = z
  .object({
    id: z.string().min(1).max(128),
    text: z
      .string()
      .trim()
      .min(8)
      .max(400)
      .refine((value) => !/\p{Cc}/u.test(value)),
    tags: z.array(taskTagSchema).min(1),
    minimumAge: z.number().int().min(5).max(18),
    difficulty: z.enum(['easy', 'medium', 'hard']),
  })
  .strict();
export type TaskDefinition = z.infer<typeof taskDefinitionSchema>;
const interval = z
  .object({ start: z.string().datetime(), end: z.string().datetime() })
  .strict()
  .refine((v) => v.start < v.end, 'End must follow start');
export const phaseSchema = z.enum([
  'DRAFT',
  'LOBBY',
  'DEAL',
  'MISSION',
  'DEBATE',
  'VOTE',
  'VERDICT',
  'SHADOW',
  'DAWN',
  'ENDGAME',
  'FINAL_VOTE',
  'FINAL_BANISH',
  'FINISHED',
  'ARCHIVED',
]);
export const roleSchema = z.enum(['traitor', 'faithful']);
export const gameConfigSchema = z
  .object({
    basics: z
      .object({
        gameName: z.string().trim().min(1).max(60).optional(),
        theme: z.enum(['classic', 'office', 'celebration']).default('classic'),
        wording: z.enum(['standard', 'family']).default('standard'),
        labels: z
          .object({
            traitor: z.string().min(1).max(20).default('Traitor'),
            faithful: z.string().min(1).max(20).default('Faithful'),
          })
          .strict()
          .default({}),
        coordinatorPlays: z.boolean().default(true),
        coCoordinators: minutes(1, 0, 3),
      })
      .strict()
      .default({}),
    players: z
      .object({
        count: minutes(15, 5, 40),
        pairedSeats: z.boolean().default(true),
        sharedDevices: z.boolean().default(true),
        lateJoining: z
          .enum(['never', 'first-vote', 'cycle'])
          .default('first-vote'),
        lateJoinCycle: minutes(1, 1, 40),
        lateRole: z.literal('faithful').default('faithful'),
        departureReveal: z.enum(['now', 'end']).default('end'),
      })
      .strict()
      .default({}),
    traitors: z
      .object({
        number: z
          .union([z.literal('auto'), z.number().int().min(1).max(8)])
          .default('auto'),
        sleeper: z.union([z.boolean(), z.literal('auto')]).default('auto'),
        recruitment: z.enum(['off', 'banished', 'below']).default('banished'),
        recruitmentBelow: minutes(2, 1, 8),
        recruitmentStyle: z.enum(['offer', 'ultimatum']).default('offer'),
        victimDecision: z
          .enum(['majority', 'unanimous', 'first'])
          .default('majority'),
        timeoutChoice: z.enum(['leading', 'random', 'none']).default('leading'),
        chat: z.boolean().default(true),
        murders: minutes(1, 0, 2),
      })
      .strict()
      .default({}),
    roundTable: z
      .object({
        debateMinutes: minutes(15, 2, 60),
        voteMinutes: minutes(3, 1, 10),
        changeVote: z.boolean().default(true),
        revealStyle: z
          .enum(['one-by-one', 'all', 'anonymous'])
          .default('one-by-one'),
        tieRule: z
          .enum(['revote-random', 'revote-none'])
          .default('revote-random'),
        revealRole: z
          .enum(['always', 'not-endgame', 'never'])
          .default('not-endgame'),
        banishments: minutes(1, 1, 2),
      })
      .strict()
      .default({}),
    missions: z
      .object({
        enabled: z.boolean().default(true),
        potUnit: z.string().min(1).max(40).default('points'),
        shields: z.enum(['off', 'public', 'secret']).default('secret'),
        allocation: z.enum(['coordinator', 'random', 'vote']).default('random'),
        doubleVote: z.literal(false).default(false),
        seer: z.literal(false).default(false),
      })
      .strict()
      .default({}),
    endgame: z
      .object({
        trigger: z.enum(['alive', 'time', 'first']).default('first'),
        size: z
          .union([z.literal('auto'), z.number().int().min(3).max(8)])
          .default('auto'),
        at: z.string().datetime().nullable().default(null),
        endRule: z.enum(['unanimous', 'majority']).default('unanimous'),
        parity: z.boolean().default(true),
      })
      .strict()
      .default({}),
    ghosts: z
      .object({
        seeRoles: z.boolean().default(false),
        finale: z.enum(['off', 'collective', 'half']).default('collective'),
        predictions: z.boolean().default(true),
        referee: z.boolean().default(true),
      })
      .strict()
      .default({}),
    schedule: z
      .object({
        format: z.enum(['quick', 'day', 'multi-day']).default('day'),
        window: interval.nullable().default(null),
        blocked: z.array(interval).default([]),
        quiet: z
          .array(
            z
              .object({
                start: z.string().regex(/^\d{2}:\d{2}$/),
                end: z.string().regex(/^\d{2}:\d{2}$/),
              })
              .strict(),
          )
          .default([]),
        advancement: z
          .enum(['manual', 'scheduled', 'hybrid'])
          .default('hybrid'),
        plannedCycles: z.number().int().min(1).max(40).nullable().default(null),
      })
      .strict()
      .default({}),
    privacy: z
      .object({
        holdMs: minutes(500, 300, 1000),
        maxRevealSeconds: minutes(10, 5, 30),
        shieldSeconds: minutes(5, 3, 10),
        seatPin: z.literal(true).default(true),
      })
      .strict()
      .default({}),
    presenter: z
      .object({
        enabled: z.boolean().default(false),
        narration: z.boolean().default(true),
        sound: z.boolean().default(true),
      })
      .strict()
      .default({}),
    data: z
      .object({
        recap: z
          .enum(['participants', 'unlisted', 'off'])
          .default('participants'),
        retentionDays: minutes(30, 7, 90),
      })
      .strict()
      .default({}),
    tasks: z
      .object({
        enabled: z.boolean().default(false),
        perCycle: z.enum(['each', 'shared']).default('each'),
        missedConsequence: z
          .enum(['none', 'lose-next-murder'])
          .default('lose-next-murder'),
        filters: z.array(taskTagSchema).default([]),
      })
      .strict()
      .default({}),
    rehearsal: z
      .object({
        enabled: z.boolean().default(false),
        botSeatIds: z.array(z.string().min(1).max(128)).max(39).default([]),
        speed: z.enum(['fast', 'normal']).default('normal'),
      })
      .strict()
      .default({}),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.missions.shields === 'secret' &&
      value.missions.allocation === 'coordinator'
    )
      ctx.addIssue({
        code: 'custom',
        path: ['missions', 'allocation'],
        message: 'Secret shields cannot use coordinator allocation',
      });
    if (
      typeof value.traitors.number === 'number' &&
      value.traitors.number >= value.players.count
    )
      ctx.addIssue({
        code: 'custom',
        path: ['traitors', 'number'],
        message: 'At least one Faithful seat is required',
      });
    if (
      value.tasks.enabled &&
      value.tasks.filters.includes('family') &&
      value.tasks.filters.includes('adults-only')
    )
      ctx.addIssue({
        code: 'custom',
        path: ['tasks', 'filters'],
        message: 'Family and adults-only task filters cannot be combined',
      });
    if (
      (!value.rehearsal.enabled && value.rehearsal.botSeatIds.length > 0) ||
      (value.rehearsal.enabled &&
        value.rehearsal.botSeatIds.length !== value.players.count - 1) ||
      new Set(value.rehearsal.botSeatIds).size !==
        value.rehearsal.botSeatIds.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['rehearsal'],
        message: 'Rehearsal bot seats must match the configured seat count',
      });
  });
export type GameConfig = z.infer<typeof gameConfigSchema>;
export function recommended(count: number) {
  const table = [
    [7, 1, 3],
    [11, 2, 4],
    [17, 3, 4],
    [24, 4, 5],
    [32, 5, 6],
    [40, 6, 6],
  ] as const;
  const row = table.find(([maximum]) => count <= maximum);
  if (!row || count < 5) throw new Error('Seats must be 5 to 40');
  return { traitors: row[1], finalSize: row[2] };
}
