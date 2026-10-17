import {
  fullViewSchema,
  visitorViewSchema,
  type FullView,
  type VisitorView,
  type View,
} from '../../shared/src/index';
import { alive, type State } from './model';

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
  'rehearsal',
  'pot',
  'unit',
  'seats',
  'commitment',
  'progress',
  'votedSeatIds',
  'voteCandidates',
  'ballots',
  'winner',
  'publicAnnouncement',
  'private',
  'publicLog',
  'coordinatorAlerts',
  'fairness',
] as const;

export type ProjectionContext = {
  lobbyCode?: string | null;
};

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
  const reveal = Boolean(viewer.reveal && (player || host || spectator));
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
  const ballots = anonymousReveal
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
  return fullViewSchema.parse({
    id: state.id,
    ...(ownSeatViewer ? { viewerSeatId: ownSeatViewer.id } : {}),
    canAdvancePhase: rehearsalOrganizer,
    ...(state.config.basics.gameName
      ? { gameName: state.config.basics.gameName }
      : {}),
    ...(lobbyCode ? { lobbyCode } : {}),
    version: state.version,
    phase: state.phase,
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
    rehearsal: state.config.rehearsal.enabled,
    pot: state.pot,
    unit: state.config.missions.potUnit,
    seats: state.seats.map((seat) => {
      const visible =
        ended || (host && reveal) || (spectator && reveal) || seat.publicRole;
      return {
        id: seat.id,
        name: seat.name,
        status: seat.status,
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
              : alive(state).filter((seat) => state.acks.includes(seat.id))
                  .length,
      total: alive(state).length,
    },
    votedSeatIds:
      state.phase === 'VOTE' || state.phase === 'FINAL_BANISH'
        ? alive(state)
            .filter((seat) => state.votes[seat.id] !== undefined)
            .map((seat) => seat.id)
        : [],
    voteCandidates: state.candidates,
    ballots,
    winner: state.winner,
    publicAnnouncement,
    publicLog: (state.publicLog ?? []).map((entry) => {
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
    private: reveal
      ? {
          role: own?.role ?? null,
          team: (host || spectator
            ? state.seats
            : isTraitor
              ? alive(state).filter((seat) => seat.role === 'traitor')
              : []
          )
            .filter((seat) => seat.role !== null)
            .map((seat) => ({
              id: seat.id,
              name: seat.name,
              role: seat.role!,
            })),
          options: alive(state)
            .filter(
              (seat) => seat.id !== own?.id && seat.id !== previousSlotChoice,
            )
            .map((seat) => ({ id: seat.id, name: seat.name })),
          choices: isTraitor
            ? Object.fromEntries(
                alive(state)
                  .filter(
                    (seat) => seat.role === 'traitor' && state.shadow[seat.id],
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
                            seat.id === pick.seatId && seat.role === 'traitor',
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
            ? state.chat.map((item) => ({
                seatId: item.seatId,
                text: item.text,
                seq: item.seq,
              }))
            : isTraitor
              ? state.chat
                  .filter((item) => item.seq >= (own?.traitorSince ?? Infinity))
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
      ended && state.deal
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
  });
}
