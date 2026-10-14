import { z } from 'zod';
import {
  gameConfigSchema,
  phaseSchema,
  roleSchema,
  taskDefinitionSchema,
} from './config';

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
  command('SubmitTaskReport', { answer: z.string().trim().min(2).max(140) }),
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
export const rehearsalStartRequestSchema = z
  .object({
    gameId: id,
    idempotencyKey: id,
    name: z
      .string()
      .trim()
      .min(2)
      .max(20)
      .refine((value) => !/\p{Cc}/u.test(value)),
    playerCount: z.number().int().min(6).max(15),
    speed: z.enum(['fast', 'normal']),
  })
  .strict();
export type RehearsalStartRequest = z.infer<typeof rehearsalStartRequestSchema>;
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
  event('SeatPinLocked', {
    seatId: id,
    lockedUntil: z.number().int().nonnegative(),
  }),
  event('SeatPinReset', { seatId: id }),
  event('DeviceRecovered', { seatId: id }),
  event('PhaseChanged', {
    phase: phaseSchema,
    deadline: z.number().nullable(),
    shadowEndAt: z.number().nullable().default(null),
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
  event('RandomChoiceRecorded', {
    purpose: z.enum([
      'cycle-vote-tie-break',
      'endgame-vote-tie-break',
      'murder-target',
    ]),
    candidates: z.array(id).min(1),
    chosen: id,
  }),
  event('ShadowSubmitted', { seatId: id, choice: id }),
  event('ShadowRoundAdvanced', {
    cycle: z.number().int().positive(),
    deadline: z.number().int().nonnegative(),
  }),
  event('TaskAssigned', {
    seatId: id,
    cycle: z.number().int().positive(),
    task: taskDefinitionSchema.nullable(),
    shared: z.boolean(),
  }),
  event('TaskReported', {
    seatId: id,
    cycle: z.number().int().positive(),
    report: z.enum(['done', 'missed']),
  }),
  event('TaskDecoyAnswered', {
    seatId: id,
    cycle: z.number().int().positive(),
    answer: z.string().min(2).max(140),
  }),
  event('TaskMurderCancelled', {
    cycle: z.number().int().positive(),
    cancelled: z.boolean(),
    traitors: z.array(id),
  }),
  event('SeatRemoved', {
    seatId: id,
    reason: z.enum(['banished', 'murdered', 'departed']),
    publicRole: z.boolean(),
  }),
  event('ShieldsAllocated', { holders: z.array(id) }),
  event('DawnResolved', { victims: z.array(id), protected: z.array(id) }),
  event('Paused', {
    remaining: z.number().nullable(),
    shadowRemaining: z.number().nullable().default(null),
  }),
  event('Resumed', {
    deadline: z.number().nullable(),
    shadowEndAt: z.number().nullable().default(null),
  }),
  event('DeadlineExtended', {
    deadline: z.number(),
    shadowEndAt: z.number().nullable().default(null),
  }),
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
    task: z
      .object({
        kind: z.enum(['task', 'decoy']),
        instruction: z.string(),
        report: z.enum(['assigned', 'done', 'missed', 'void']).nullable(),
        murderLost: z.boolean(),
      })
      .strict()
      .nullable(),
    minimumDurationMs: z.number(),
  })
  .strict();
export const fullViewSchema = z
  .object({
    id,
    gameName: z.string().trim().min(1).max(60).optional(),
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
    publicAnnouncement: z
      .discriminatedUnion('kind', [
        z
          .object({
            kind: z.literal('dawn'),
            cycle: z.number().int().nonnegative(),
            victims: z.array(z.object({ id, name: z.string() }).strict()),
          })
          .strict(),
        z
          .object({
            kind: z.literal('verdict'),
            cycle: z.number().int().nonnegative(),
            seat: z
              .object({
                id,
                name: z.string(),
                role: roleSchema.optional(),
              })
              .strict(),
          })
          .strict(),
        z
          .object({
            kind: z.literal('finished'),
            winner: roleSchema,
          })
          .strict(),
      ])
      .nullable(),
    private: privateViewSchema.nullable(),
    publicLog: z.array(
      z
        .object({
          seq: z.number().int().positive(),
          at: z.number().int().nonnegative(),
          action: z.enum(['seat_pin_reset', 'device_recovered']),
          seatId: id,
          name: z.string(),
        })
        .strict(),
    ),
    coordinatorAlerts: z.array(
      z
        .object({
          seq: z.number().int().positive(),
          at: z.number().int().nonnegative(),
          code: z.literal('seat_pin_locked'),
          seatId: id,
          name: z.string(),
          lockedUntil: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    fairness: z
      .object({
        salt: z.string(),
        roles: z.record(roleSchema),
        sleeper: z.string().nullable(),
        tasks: z.array(
          z
            .object({
              seatId: id,
              cycle: z.number().int().positive(),
              taskId: id.nullable(),
              text: z.string(),
              report: z.enum(['assigned', 'done', 'missed', 'void']),
              shared: z.boolean(),
              complete: z.boolean(),
            })
            .strict(),
        ),
        decoys: z.array(
          z
            .object({
              seatId: id,
              cycle: z.number().int().positive(),
              answer: z.string(),
            })
            .strict(),
        ),
      })
      .strict()
      .nullable(),
  })
  .strict();
export const visitorViewSchema = z
  .object({
    exists: z.literal(true),
    phase: phaseSchema,
    lobbyOpen: z.boolean(),
    seatCount: z.number().int().nonnegative(),
  })
  .strict();
export const viewSchema = z.union([visitorViewSchema, fullViewSchema]);
export type FullView = z.infer<typeof fullViewSchema>;
export type VisitorView = z.infer<typeof visitorViewSchema>;
export type View = z.infer<typeof viewSchema>;
export const gameViewResponseSchema = z
  .object({
    version: z.number().int().nonnegative(),
    view: viewSchema,
  })
  .strict();
export const coordinatorHandoffCreateRequestSchema = z
  .object({ targetSeatId: id })
  .strict();
export const coordinatorHandoffClaimRequestSchema = z
  .object({
    gameId: id,
    code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
export const coordinatorHandoffResponseSchema = z
  .object({ code: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
export const coordinatorHandoffClaimResponseSchema = z
  .object({ status: z.literal('transferred') })
  .strict();
export const apiErrorResponseSchema = z
  .object({
    error: z.string().min(1).max(80),
  })
  .strict();
export const gameWatchSchema = z.object({ gameId: id }).strict();
export const gameChangedNotificationSchema = z
  .object({ gameId: id, source: id })
  .strict();
export const csrfTokenResponseSchema = z
  .object({ csrfToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
export const guestJoinRequestSchema = z
  .object({
    inviteToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    name: z
      .string()
      .trim()
      .min(2)
      .max(20)
      .refine((v) => !/\p{Cc}/u.test(v)),
    pin: z.string().regex(/^\d{4,6}$/),
    idempotencyKey: id,
  })
  .strict();
export const gameInviteResponseSchema = z
  .object({
    gameId: id,
    joinUrl: z.string().url(),
    shortCode: z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/),
  })
  .strict();
export const shortCodeJoinRequestSchema = z
  .object({
    shortCode: z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/),
    name: z
      .string()
      .trim()
      .min(2)
      .max(20)
      .refine((v) => !/\p{Cc}/u.test(v)),
    pin: z.string().regex(/^\d{4,6}$/),
    idempotencyKey: id,
  })
  .strict();
export const seatRecoveryRequestSchema = z
  .object({
    shortCode: z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/),
    name: z
      .string()
      .trim()
      .min(2)
      .max(20)
      .refine((v) => !/\p{Cc}/u.test(v)),
    pin: z.string().regex(/^\d{4,6}$/),
  })
  .strict();
export const seatPinResetRequestSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    newPin: z.string().regex(/^\d{4,6}$/),
  })
  .strict();
export const pendingJoinRequestsResponseSchema = z
  .object({
    requests: z.array(
      z
        .object({
          id,
          seatId: id,
          name: z.string().min(2).max(20),
          createdAt: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();
export const joinRequestDecisionSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
export const joinRequestCreatedResponseSchema = z
  .object({
    requestId: id,
    status: z.literal('pending'),
  })
  .strict();
export const joinRequestDecisionResponseSchema = z
  .object({
    status: z.enum(['approved', 'rejected']),
    seatId: id,
  })
  .strict();
export const joinRequestStatusResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }).strict(),
  z.object({ status: z.literal('rejected') }).strict(),
  z
    .object({
      status: z.literal('approved'),
      game: gameViewResponseSchema,
    })
    .strict(),
]);
export const presenterPairRequestSchema = z
  .object({
    gameId: id,
    code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
export const presenterPairingResponseSchema = z
  .object({
    code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    expiresAt: z.number().int().nonnegative(),
  })
  .strict();
export const presenterPairResponseSchema = z
  .object({
    game: gameViewResponseSchema,
  })
  .strict();
