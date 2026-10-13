import { z } from 'zod';
import { gameConfigSchema, phaseSchema, roleSchema } from './config';

const id = z.string().min(1).max(128);
const envelope = z.object({
  idempotencyKey: id,
  expectedVersion: z.number().int().nonnegative().optional(),
});
const command = <
  T extends string,
  S extends z.ZodRawShape = Record<never, never>,
>(
  type: T,
  shape: S = {} as S,
) => envelope.extend({ type: z.literal(type), ...shape }).strict();
export const commandSchema = z.union([
  command('CreateGame', { id, config: gameConfigSchema }),
  command('JoinGame', {
    seatId: id,
    name: z
      .string()
      .trim()
      .min(2)
      .max(20)
      .refine((v) => !/\p{Cc}/u.test(v)),
  }),
  command('StartGame'),
  command('AdvancePhase'),
  command('Pause'),
  command('Resume'),
  command('AcknowledgePrivate'),
  command('RequestRedeal'),
  command('SubmitVote', { target: id }),
  command('SubmitShadowChoice', { choice: id }),
  command('MarkDeparted', { seatId: id }),
  command('AllocatePower', { holders: z.array(id).min(1).max(40) }),
  command('PostTraitorMessage', {
    text: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine((v) => !/\p{Cc}/u.test(v)),
  }),
  command('SubmitEndgameVote', { choice: z.enum(['end', 'continue']) }),
  command('ExtendPhase', {
    minutes: z.union([z.literal(1), z.literal(5), z.literal(15)]),
  }),
  command('EndGameEarly'),
]);
const eventBase = {
  seq: z.number().int().positive(),
  at: z.number().int().nonnegative(),
  schemaVersion: z.literal(1),
};
const event = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.object({ ...eventBase, type: z.literal(type), ...shape }).strict();
export const eventSchema = z.discriminatedUnion('type', [
  event('GameCreated', { id, config: gameConfigSchema }),
  event('SeatJoined', { seatId: id, name: z.string() }),
  event('PhaseChanged', {
    phase: phaseSchema,
    deadline: z.number().nullable(),
    cycle: z.number().int().nonnegative(),
  }),
  event('RolesDealt', {
    roles: z.record(roleSchema),
    salt: z.string().regex(/^[a-f0-9]{64}$/),
    commitment: z.string().regex(/^[a-f0-9]{64}$/),
    sleeper: id.nullable(),
    redeal: z.boolean(),
  }),
  event('PrivateAcknowledged', { seatId: id }),
  event('VoteSubmitted', { seatId: id, target: id }),
  event('VoteRevealed', { seatId: id }),
  event('VoteClosed', {
    target: id.nullable(),
    revote: z.boolean(),
    candidates: z.array(id),
  }),
  event('ShadowSubmitted', { seatId: id, choice: id }),
  event('SeatRemoved', {
    seatId: id,
    reason: z.enum(['banished', 'murdered', 'departed']),
    publicRole: z.boolean(),
  }),
  event('ShieldsAllocated', { holders: z.array(id) }),
  event('DawnResolved', { victims: z.array(id), protected: z.array(id) }),
  event('Paused', { remaining: z.number().nullable() }),
  event('Resumed', { deadline: z.number().nullable() }),
  event('DeadlineExtended', { deadline: z.number() }),
  event('SleeperWaiting', {}),
  event('SleeperActivated', { seatId: id }),
  event('TraitorMessage', { seatId: id, text: z.string() }),
  event('EndgameVote', { seatId: id, choice: z.enum(['end', 'continue']) }),
  event('GameFinished', { winner: roleSchema, reason: z.string() }),
]);
export type Event = z.infer<typeof eventSchema>;
export const privateViewSchema = z
  .object({
    role: roleSchema.nullable(),
    team: z.array(
      z.object({ id, name: z.string(), role: roleSchema }).strict(),
    ),
    options: z.array(z.object({ id, name: z.string() }).strict()),
    choices: z.record(id),
    chat: z.array(
      z.object({ seatId: id, text: z.string(), seq: z.number() }).strict(),
    ),
    minimumDurationMs: z.number(),
  })
  .strict();
export const viewSchema = z
  .object({
    id,
    version: z.number(),
    phase: phaseSchema,
    paused: z.boolean(),
    deadline: z.number().nullable(),
    coordinatorPlays: z.boolean(),
    cycle: z.number(),
    pot: z.number().nonnegative(),
    unit: z.string(),
    seats: z.array(
      z
        .object({
          id,
          name: z.string(),
          status: z.enum(['alive', 'banished', 'murdered', 'departed']),
          role: roleSchema.optional(),
        })
        .strict(),
    ),
    commitment: z.string().nullable(),
    progress: z.object({ done: z.number(), total: z.number() }).strict(),
    ballots: z.record(id),
    winner: roleSchema.nullable(),
    private: privateViewSchema.nullable(),
    fairness: z
      .object({
        salt: z.string(),
        roles: z.record(roleSchema),
        sleeper: z.string().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type View = z.infer<typeof viewSchema>;
