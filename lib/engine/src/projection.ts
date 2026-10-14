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
  'gameName',
  'lobbyCode',
  'version',
  'phase',
  'paused',
  'deadline',
  'coordinatorPlays',
  'cycle',
  'pot',
  'unit',
  'seats',
  'commitment',
  'progress',
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
  const ballots =
    state.phase === 'VERDICT'
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
  return fullViewSchema.parse({
    id: state.id,
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
      done: alive(state).filter((seat) => state.acks.includes(seat.id)).length,
      total: alive(state).length,
    },
    ballots,
    winner: state.winner,
    publicAnnouncement,
    publicLog: (state.publicLog ?? []).map((entry) => ({
      seq: entry.seq,
      at: entry.at,
      action: entry.action,
      seatId: entry.seatId,
      name: state.seats.find((seat) => seat.id === entry.seatId)?.name ?? '',
    })),
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
            .filter((seat) => seat.id !== own?.id)
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
          }
        : null,
  });
}
