import {
  fullViewSchema,
  visitorViewSchema,
  type FullView,
  type VisitorView,
  type View,
} from '../../shared/src/index';
import { alive, pendingActionSeatIds, type State } from './model';
import { getCoordinatorMinimumAdvanceAt } from './phase-timing';

export type Viewer =
  | { kind: 'visitor'; seatId?: string; reveal?: boolean }
  | {
      kind: 'player' | 'ghost' | 'coordinator' | 'presenter' | 'host' | 'admin';
      seatId?: string;
      reveal?: boolean;
    };
export const VISITOR_VIEW_ALLOW_LIST = [
  'exists',
  'phase',
  'lobbyOpen',
  'seatCount',
] as const;
export const VIEW_ALLOW_LIST = [
  'id',
  'viewerSeatId',
  'canAdvancePhase',
  'gameName',
  'lobbyCode',
  'version',
  'phase',
  'phaseStartedAt',
  'coordinatorMinimumAdvanceAt',
  'paused',
  'deadline',
  'coordinatorPlays',
  'cycle',
  'revote',
  'shadowRound',
  'shadowSlot',
  'murderSlots',
  'endRule',
  'missionsEnabled',
  'shieldsPublic',
  'shieldHolderIds',
  'rehearsal',
  'pot',
  'unit',
  'seats',
  'commitment',
  'progress',
  'actionStatus',
  'coordinatorPendingSeats',
  'coordinatorRestorableSeats',
  'coordinatorSkippedSeats',
  'votedSeatIds',
  'voteCandidates',
  'ballots',
  'voteCircle',
  'ownVoteTargetId',
  'winner',
  'publicAnnouncement',
  'organiserNotice',
  'private',
  'publicLog',
  'coordinatorUndo',
  'coordinatorAlerts',
  'fairness',
] as const;

export type ProjectionContext = {
  lobbyCode?: string | null;
  disconnectedSeatIds?: readonly string[];
  connectedSeatIds?: readonly string[];
};

type PublicLogEntry = FullView['publicLog'][number];
const viewWithoutPublicLogSchema = fullViewSchema.omit({ publicLog: true });
const viewKeys = Object.keys(fullViewSchema.shape);
const validatedLogEntries = new WeakMap<
  State['publicLog'][number],
  { input: unknown; output: PublicLogEntry }
>();

function sameProjectedValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    !left ||
    !right ||
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    Array.isArray(left) !== Array.isArray(right)
  )
    return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) => Object.hasOwn(b, key) && sameProjectedValue(a[key], b[key]),
    )
  );
}

function freezeLogEntry(entry: PublicLogEntry): PublicLogEntry {
  if ('victims' in entry) {
    entry.victims.forEach(Object.freeze);
    Object.freeze(entry.victims);
  }
  if ('seat' in entry) Object.freeze(entry.seat);
  return Object.freeze(entry);
}

function copyLogEntry(entry: PublicLogEntry): PublicLogEntry {
  if ('victims' in entry)
    return {
      ...entry,
      victims: entry.victims.map((victim) => ({ ...victim })),
    };
  if ('seat' in entry) return { ...entry, seat: { ...entry.seat } };
  return { ...entry };
}

function parseProjectedView(
  input: Record<string, unknown> & { publicLog: unknown[] },
  sources: State['publicLog'],
): FullView {
  const { publicLog: rawLog, ...otherFields } = input;
  let invalidLog = false;
  const publicLog = rawLog.map((entry, index) => {
    const source = sources[index]!;
    const cached = validatedLogEntries.get(source);
    // Compare fresh projected contents, including current seat names and nested
    // victims. Neither state/version identity nor mutable source identity alone
    // permits reuse. These privately owned snapshots never escape to callers.
    if (cached && sameProjectedValue(cached.input, entry))
      return copyLogEntry(cached.output);
    const parsed = fullViewSchema.shape.publicLog.element.safeParse(entry);
    if (!parsed.success) {
      invalidLog = true;
      return entry;
    }
    const output = freezeLogEntry(parsed.data);
    validatedLogEntries.set(source, {
      input: freezeLogEntry(entry as PublicLogEntry),
      output,
    });
    return copyLogEntry(output);
  });
  // publicLog is an array constructed above; every element has been validated
  // against the original element schema. All other fields still use the exact
  // original schemas (including defaults, stripping and strict nested objects).
  const parsed = viewWithoutPublicLogSchema.safeParse(otherFields);
  if (invalidLog || !parsed.success)
    // Preserve the original complete issues, paths and ordering on rejection.
    return fullViewSchema.parse(input);
  const fields: Record<string, unknown> = parsed.data;
  const output: Record<string, unknown> = {};
  // Preserve schema key order as well as values for JSON consumers.
  for (const key of viewKeys)
    if (key === 'publicLog') output[key] = publicLog;
    else if (Object.hasOwn(fields, key)) output[key] = fields[key];
  return output as FullView;
}

// Never spread state, seats or events: construct every field and nested field.
export function viewFor(
  viewer: Extract<Viewer, { kind: 'visitor' }>,
  state: State,
  context?: ProjectionContext,
): VisitorView;
export function viewFor(
  viewer: Exclude<Viewer, { kind: 'visitor' }>,
  state: State,
  context?: ProjectionContext,
): FullView;
export function viewFor(
  viewer: Viewer,
  state: State,
  context: ProjectionContext = {},
): View {
  if (viewer.kind === 'visitor') {
    return visitorViewSchema.parse({
      exists: true,
      phase: state.phase,
      lobbyOpen: state.phase === 'LOBBY',
      seatCount: state.seats.length,
    });
  }

  const own = state.seats.find((seat) => seat.id === viewer.seatId);
  const presenter = viewer.kind === 'presenter';
  const ended = state.phase === 'FINISHED';
  const ownSeatViewer =
    (viewer.kind === 'player' || viewer.kind === 'ghost') && own ? own : null;
  const host = viewer.kind === 'host' && !state.config.basics.coordinatorPlays;
  const spectator =
    viewer.kind === 'ghost' &&
    own?.status !== 'alive' &&
    Boolean(own) &&
    state.config.ghosts.seeRoles;
  const player = viewer.kind === 'player' && own?.status === 'alive';
  const lobbyCode =
    state.phase === 'LOBBY' &&
    (player || viewer.kind === 'presenter') &&
    context.lobbyCode
      ? context.lobbyCode
      : undefined;
  const pendingActions = pendingActionSeatIds(state);
  const disconnectedSeatIds = new Set(context.disconnectedSeatIds ?? []);
  const coordinator = viewer.kind === 'coordinator' || host;
  const reveal = Boolean(
    viewer.reveal &&
    (player || host || spectator) &&
    !(own && state.hiddenRoleSeatIds.includes(own.id)),
  );
  const isTraitor = player && own?.role === 'traitor';
  const rehearsalOrganizer =
    (viewer.kind === 'player' || viewer.kind === 'ghost') &&
    Boolean(
      own &&
      state.config.rehearsal.enabled &&
      !state.config.rehearsal.botSeatIds.includes(own.id),
    );
  const submittedVoters = Object.keys(state.votes);
  const completedReveal =
    submittedVoters.length > 0 &&
    submittedVoters.every((id) => state.revealed.includes(id));
  const anonymousReveal =
    state.config.roundTable.revealStyle === 'anonymous' && completedReveal;
  const ballots = presenter
    ? {}
    : anonymousReveal
      ? Object.fromEntries(
          submittedVoters
            .filter((id) => state.revealed.includes(id))
            .map((id, index) => [
              `anonymous-vote-${index + 1}`,
              state.votes[id]!,
            ]),
        )
      : state.phase === 'VERDICT' &&
          state.config.roundTable.revealStyle !== 'anonymous'
        ? Object.fromEntries(
            state.revealed
              .filter((id) => state.votes[id])
              .map((id) => [id, state.votes[id]!]),
          )
        : {};
  const announcement = state.publicAnnouncement;
  let publicAnnouncement: FullView['publicAnnouncement'] = null;
  if (announcement?.kind === 'dawn') {
    publicAnnouncement = {
      kind: 'dawn',
      cycle: announcement.cycle,
      victims: announcement.victimIds.flatMap((id) => {
        const seat = state.seats.find((candidate) => candidate.id === id);
        return seat ? [{ id: seat.id, name: seat.name }] : [];
      }),
    };
  } else if (announcement?.kind === 'no_votes') {
    publicAnnouncement = {
      kind: 'no_votes',
      cycle: announcement.cycle,
    };
  } else if (announcement?.kind === 'verdict') {
    const seat = state.seats.find(
      (candidate) => candidate.id === announcement.seatId,
    );
    if (!seat) throw new Error('Banishment announcement seat is missing');
    publicAnnouncement = {
      kind: 'verdict',
      cycle: announcement.cycle,
      seat: {
        id: seat.id,
        name: seat.name,
        ...(seat.publicRole && seat.role ? { role: seat.role } : {}),
      },
      ...(announcement.chosenAtRandom ? { chosenAtRandom: true as const } : {}),
    };
  } else if (announcement?.kind === 'finished') {
    publicAnnouncement = {
      kind: 'finished',
      winner: announcement.winner,
    };
  }
  const previousSlotChoice =
    state.phase === 'SHADOW' && state.shadowSlot === 2 && own
      ? state.shadowPicks
          .filter(
            (pick) =>
              pick.cycle === state.cycle &&
              pick.slot === 1 &&
              pick.seatId === own.id,
          )
          .sort((left, right) => right.seq - left.seq)[0]?.choice
      : undefined;
  const voteCircleActive =
    state.phase === 'VERDICT' &&
    state.config.roundTable.revealStyle === 'speaker-circle' &&
    state.voteRevealOrder.length > 0;
  const voteSpeakerId = voteCircleActive
    ? (state.voteRevealOrder.find((id) => !state.revealed.includes(id)) ?? null)
    : null;
  const publicLogSources = (state.publicLog ?? []).filter(
    (entry) => !presenter || entry.action !== 'finished',
  );
  const projected = {
    id: state.id,
    ...(ownSeatViewer ? { viewerSeatId: ownSeatViewer.id } : {}),
    canAdvancePhase: rehearsalOrganizer && voteSpeakerId === null,
    ...(state.config.basics.gameName
      ? { gameName: state.config.basics.gameName }
      : {}),
    ...(lobbyCode ? { lobbyCode } : {}),
    version: state.version,
    phase: state.phase,
    phaseStartedAt: state.phaseStarted,
    ...(viewer.kind === 'coordinator' || rehearsalOrganizer
      ? {
          coordinatorMinimumAdvanceAt: getCoordinatorMinimumAdvanceAt(state),
        }
      : {}),
    paused: state.paused,
    deadline: state.phase === 'SHADOW' ? state.shadowEndAt : state.deadline,
    coordinatorPlays: state.config.basics.coordinatorPlays,
    cycle: state.cycle,
    revote: state.revote,
    shadowRound: state.shadowRound,
    shadowSlot: state.shadowSlot,
    murderSlots: Math.min(2, state.config.traitors.murders),
    endRule: state.config.endgame.endRule,
    missionsEnabled: state.config.missions.enabled,
    shieldsPublic: state.config.missions.shields === 'public',
    // A secret shield holder is never projected to any viewer.
    shieldHolderIds:
      state.config.missions.shields === 'public' ? [...state.shields] : [],
    rehearsal: state.config.rehearsal.enabled,
    pot: state.pot,
    unit: state.config.missions.potUnit,
    seats: state.seats.map((seat) => {
      const visible =
        !presenter &&
        !state.hiddenRoleSeatIds.includes(seat.id) &&
        (ended || (host && reveal) || (spectator && reveal) || seat.publicRole);
      return {
        id: seat.id,
        name: seat.name,
        status: seat.status,
        ...(viewer.kind === 'player' && context.connectedSeatIds
          ? { connected: context.connectedSeatIds.includes(seat.id) }
          : {}),
        ...(visible && seat.role ? { role: seat.role } : {}),
      };
    }),
    commitment: state.deal?.commitment ?? null,
    progress: {
      done:
        state.phase === 'VOTE' || state.phase === 'FINAL_BANISH'
          ? alive(state).filter((seat) => state.votes[seat.id] !== undefined)
              .length
          : state.phase === 'FINAL_VOTE'
            ? alive(state).filter(
                (seat) => state.endVotes[seat.id] !== undefined,
              ).length
            : state.phase === 'DEAL'
              ? alive(state).filter((seat) =>
                  (state.readySeats ?? []).includes(seat.id),
                ).length
              : state.phase === 'SHADOW'
                ? alive(state).length - pendingActionSeatIds(state).length
                : alive(state).filter((seat) => state.acks.includes(seat.id))
                    .length,
      total: alive(state).length,
    },
    actionStatus: {
      waiting: pendingActions.length,
      total: alive(state).length,
    },
    ...(coordinator
      ? {
          coordinatorPendingSeats: pendingActions
            .map((seatId) => state.seats.find((seat) => seat.id === seatId))
            .filter((seat): seat is NonNullable<typeof seat> => Boolean(seat))
            .map((seat) => ({
              id: seat.id,
              name: seat.name,
              disconnected: disconnectedSeatIds.has(seat.id),
            })),
          coordinatorRestorableSeats: state.disconnectedRemovals
            .filter(
              (removal) =>
                removal.restorable &&
                removal.phase === state.phase &&
                removal.cycle === state.cycle,
            )
            .map((removal) =>
              state.seats.find((seat) => seat.id === removal.seatId),
            )
            .filter((seat): seat is NonNullable<typeof seat> => Boolean(seat))
            .map((seat) => ({ id: seat.id, name: seat.name })),
          coordinatorSkippedSeats: state.skippedActions
            .filter(
              (skip) =>
                skip.phase === state.phase &&
                skip.cycle === state.cycle &&
                (state.phase !== 'SHADOW' ||
                  (skip.shadowSlot === state.shadowSlot &&
                    skip.shadowRound === state.shadowRound)),
            )
            .map((skip) => state.seats.find((seat) => seat.id === skip.seatId))
            .filter((seat): seat is NonNullable<typeof seat> => Boolean(seat))
            .map((seat) => ({ id: seat.id, name: seat.name })),
        }
      : {}),
    votedSeatIds:
      !presenter && (state.phase === 'VOTE' || state.phase === 'FINAL_BANISH')
        ? alive(state)
            .filter((seat) => state.votes[seat.id] !== undefined)
            .map((seat) => seat.id)
        : [],
    voteCandidates: presenter ? [] : state.candidates,
    ballots,
    ...(!presenter && voteCircleActive
      ? { voteCircle: { speakerSeatId: voteSpeakerId } }
      : {}),
    ...(viewer.kind === 'player' &&
    own &&
    voteCircleActive &&
    state.votes[own.id]
      ? { ownVoteTargetId: state.votes[own.id] }
      : {}),
    winner: presenter ? null : state.winner,
    publicAnnouncement,
    organiserNotice: state.organiserNotice ?? null,
    publicLog: publicLogSources.map((entry) => {
      if (
        entry.action === 'seat_pin_reset' ||
        entry.action === 'device_recovered'
      )
        return {
          seq: entry.seq,
          at: entry.at,
          action: entry.action,
          seatId: entry.seatId,
          name:
            state.seats.find((seat) => seat.id === entry.seatId)?.name ?? '',
        };
      if (entry.action === 'dawn')
        return {
          seq: entry.seq,
          at: entry.at,
          action: entry.action,
          victims: entry.victimIds.map((id) => ({
            id,
            name: state.seats.find((seat) => seat.id === id)?.name ?? '',
          })),
        };
      if (entry.action === 'no_votes')
        return {
          seq: entry.seq,
          at: entry.at,
          action: entry.action,
        };
      if (entry.action === 'shield_given')
        return {
          seq: entry.seq,
          at: entry.at,
          action: entry.action,
          seats: entry.seatIds.map((id) => ({
            id,
            name: state.seats.find((seat) => seat.id === id)?.name ?? '',
          })),
        };
      if (entry.action === 'banishment')
        return {
          seq: entry.seq,
          at: entry.at,
          action: entry.action,
          seat: {
            id: entry.seatId,
            name:
              state.seats.find((seat) => seat.id === entry.seatId)?.name ?? '',
          },
        };
      if (entry.action === 'seat_departed')
        return {
          seq: entry.seq,
          at: entry.at,
          action: entry.action,
          seat: {
            id: entry.seatId,
            name:
              state.seats.find((seat) => seat.id === entry.seatId)?.name ?? '',
          },
        };
      if (
        entry.action === 'seat_left_disconnected' ||
        entry.action === 'seat_reinstated'
      )
        return {
          seq: entry.seq,
          at: entry.at,
          action: entry.action,
          seat: {
            id: entry.seatId,
            name:
              state.seats.find((seat) => seat.id === entry.seatId)?.name ?? '',
          },
          ...(entry.action === 'seat_left_disconnected'
            ? { reason: entry.reason }
            : {}),
        };
      if (entry.action === 'coordinator_role_moved')
        return {
          seq: entry.seq,
          at: entry.at,
          action: entry.action,
        };
      if (
        entry.action === 'phase_action_skipped' ||
        entry.action === 'phase_action_skip_undone'
      )
        return {
          seq: entry.seq,
          at: entry.at,
          action: entry.action,
          seat: {
            id: entry.seatId,
            name:
              state.seats.find((seat) => seat.id === entry.seatId)?.name ?? '',
          },
          phase: entry.phase,
          ...(entry.action === 'phase_action_skipped'
            ? { reason: entry.reason }
            : {}),
        };
      if (entry.action === 'schedule_shift')
        return {
          seq: entry.seq,
          at: entry.at,
          action: entry.action,
          minutes: entry.minutes,
        };
      if (entry.action === 'coordinator_undo')
        return {
          seq: entry.seq,
          at: entry.at,
          action: entry.action,
        };
      return {
        seq: entry.seq,
        at: entry.at,
        action: entry.action,
        winner: entry.winner,
      };
    }),
    coordinatorAlerts:
      viewer.kind === 'coordinator'
        ? (state.coordinatorAlerts ?? []).map((alert) => ({
            seq: alert.seq,
            at: alert.at,
            code: alert.code,
            seatId: alert.seatId,
            name:
              state.seats.find((seat) => seat.id === alert.seatId)?.name ?? '',
            lockedUntil: alert.lockedUntil,
          }))
        : [],
    private:
      !presenter && reveal
        ? {
            role: own?.role ?? null,
            team: (host || spectator
              ? state.seats
              : isTraitor
                ? alive(state).filter((seat) => seat.role === 'traitor')
                : []
            )
              .filter(
                (seat) =>
                  seat.role !== null &&
                  !state.hiddenRoleSeatIds.includes(seat.id),
              )
              .map((seat) => ({
                id: seat.id,
                name: seat.name,
                role: seat.role!,
              })),
            options: (state.phase === 'SHADOW'
              ? alive(state).filter((seat) => seat.id !== previousSlotChoice)
              : alive(state).filter(
                  (seat) =>
                    seat.id !== own?.id && seat.id !== previousSlotChoice,
                )
            ).map((seat) => ({ id: seat.id, name: seat.name })),
            choices: isTraitor
              ? Object.fromEntries(
                  alive(state)
                    .filter(
                      (seat) =>
                        seat.role === 'traitor' && state.shadow[seat.id],
                    )
                    .map((seat) => [seat.id, state.shadow[seat.id]!]),
                )
              : {},
            choiceSlots: [1, 2].flatMap((slot) =>
              [1, 2].flatMap((round) => {
                const picks = state.shadowPicks
                  .filter(
                    (pick) =>
                      pick.cycle === state.cycle &&
                      pick.slot === slot &&
                      pick.round === round &&
                      (isTraitor
                        ? alive(state).some(
                            (seat) =>
                              seat.id === pick.seatId &&
                              seat.role === 'traitor',
                          )
                        : viewer.kind === 'player' &&
                          own?.role === 'faithful' &&
                          own.id === pick.seatId),
                  )
                  .sort((left, right) => left.seq - right.seq)
                  .map(({ seatId, choice }) => ({ seatId, choice }));
                return picks.length
                  ? [{ slot: slot as 1 | 2, round: round as 1 | 2, picks }]
                  : [];
              }),
            ),
            chat: host
              ? state.chat
                  .filter(
                    (item) => !state.hiddenRoleSeatIds.includes(item.seatId),
                  )
                  .map((item) => ({
                    seatId: item.seatId,
                    text: item.text,
                    seq: item.seq,
                  }))
              : isTraitor
                ? state.chat
                    .filter(
                      (item) =>
                        item.seq >= (own?.traitorSince ?? Infinity) &&
                        !state.hiddenRoleSeatIds.includes(item.seatId),
                    )
                    .map((item) => ({
                      seatId: item.seatId,
                      text: item.text,
                      seq: item.seq,
                    }))
                : [],
            task:
              state.config.tasks.enabled && own
                ? (() => {
                    const taskCycle =
                      state.phase === 'DEAL'
                        ? 1
                        : state.phase === 'DAWN'
                          ? state.cycle + 1
                          : state.cycle;
                    const assignment = state.taskAssignments.find(
                      (task) =>
                        task.seatId === own.id &&
                        task.cycle === taskCycle &&
                        task.status !== 'void',
                    );
                    const actual =
                      own.role === 'traitor' ? assignment : undefined;
                    const privateTask =
                      actual?.taskId !== null ? actual : undefined;
                    return {
                      kind: privateTask ? 'task' : 'decoy',
                      instruction:
                        privateTask?.text ??
                        'Keep watch today: who is acting oddly?',
                      report: privateTask?.status ?? null,
                      murderLost:
                        isTraitor &&
                        state.taskMurderCancelledCycles.some(
                          (resolution) =>
                            resolution.cycle === state.cycle &&
                            resolution.cancelled &&
                            resolution.traitors.includes(own.id),
                        ),
                    };
                  })()
                : null,
            minimumDurationMs:
              state.config.privacy.shieldSeconds * 1000 +
              state.config.privacy.holdMs,
          }
        : null,
    fairness:
      !presenter && ended && state.deal && state.hiddenRoleSeatIds.length === 0
        ? {
            salt: state.deal.salt,
            roles: state.deal.roles,
            sleeper: state.deal.sleeper,
            tasks: state.taskAssignments
              .filter((task) => task.taskId)
              .map((task) => ({
                seatId: task.seatId,
                cycle: task.cycle,
                taskId: task.taskId!,
                text: task.text,
                report: task.status,
                shared: task.shared,
                complete: task.shared
                  ? state.taskAssignments.some(
                      (other) =>
                        other.cycle === task.cycle &&
                        other.taskId === task.taskId &&
                        other.shared &&
                        other.status === 'done',
                    )
                  : task.status === 'done',
              })),
            decoys: state.taskReports.map((response) => ({
              seatId: response.seatId,
              cycle: response.cycle,
              answer: response.answer,
            })),
            murderSlots: state.murderResolutions.map((resolution) => ({
              cycle: resolution.cycle,
              slot: resolution.slot,
              picks: resolution.picks.flatMap((pick) => {
                const player = state.seats.find(
                  (seat) => seat.id === pick.seatId,
                );
                const target = state.seats.find(
                  (seat) => seat.id === pick.choice,
                );
                return player && target
                  ? [
                      {
                        seatId: player.id,
                        seatName: player.name,
                        choiceSeatId: target.id,
                        choiceName: target.name,
                        round: pick.round,
                      },
                    ]
                  : [];
              }),
              chosen: resolution.chosen
                ? {
                    id: resolution.chosen,
                    name:
                      state.seats.find((seat) => seat.id === resolution.chosen)
                        ?.name ?? '',
                  }
                : null,
              outcome: resolution.outcome,
            })),
          }
        : null,
  };
  return parseProjectedView(projected, publicLogSources);
}
