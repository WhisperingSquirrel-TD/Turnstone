import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  CoordinatorConsole,
  formatCoordinatorCountdown,
  getCoordinatorEndConfirmation,
  getCoordinatorMoveConfirmation,
  type CoordinatorConsoleView,
} from './CoordinatorConsole';
import { en } from './locale/en-GB';

const view: CoordinatorConsoleView = {
  phase: 'VOTE',
  revote: false,
  paused: false,
  deadline: 1_800_000_030_000,
  serverNow: 1_800_000_000_000,
  progress: { done: 3, total: 8 },
  actionStatus: { waiting: 0, total: 8 },
  seats: [],
  publicLog: [],
  coordinatorAlerts: [],
  coordinatorUndo: null,
};

const onLoadCoordinatorDelegates = async () => ({ limit: 0, seatIds: [] });
const onSaveCoordinatorDelegates = async (seatIds: string[]) => ({
  limit: 0,
  seatIds,
});
const onHeartbeat = async () => {};

describe('CoordinatorConsole', () => {
  it('shows phase, server-clock countdown, aggregate progress and logistics controls', () => {
    const html = renderToString(
      <CoordinatorConsole
        view={view}
        presenterPath="/tv/test"
        onCreatePresenterPairing={async () => ({
          code: 'A'.repeat(43),
          expiresAt: 1_800_000_600_000,
        })}
        onCommand={async () => {}}
        onLoadCoordinatorDelegates={onLoadCoordinatorDelegates}
        onSaveCoordinatorDelegates={onSaveCoordinatorDelegates}
        onHeartbeat={onHeartbeat}
      />,
    );

    expect(html).toContain('The vote');
    expect(html).toMatch(/Time left: 0:(?:29|30)/);
    expect(html.replaceAll('<!-- -->', '')).toContain('3 of 8 done');
    expect(html).toContain('Pause game');
    expect(html).toContain('Add 1 minute');
    expect(html).toContain('Add 5 minutes');
    expect(html).toContain('Add 15 minutes');
    expect(html).toContain('Move everyone on');
    expect(html).toContain('End game early');
    expect(html).not.toContain('Practice player');
    expect(html).not.toContain('Traitor');
  });

  it('puts the player list ahead of organiser details in the lobby', () => {
    const html = renderToString(
      <CoordinatorConsole
        view={{ ...view, phase: 'LOBBY' }}
        presenterPath="/tv/test"
        onCreatePresenterPairing={async () => ({
          code: 'A'.repeat(43),
          expiresAt: 1_800_000_600_000,
        })}
        onCommand={async () => {}}
        onLoadCoordinatorDelegates={onLoadCoordinatorDelegates}
        onSaveCoordinatorDelegates={onSaveCoordinatorDelegates}
        onHeartbeat={onHeartbeat}
      />,
    );
    expect(html).toContain('data-phase="LOBBY"');
    expect(html).toContain(
      `id="coordinator-console-title">${en.entry.lobbyHeading}</h1>`,
    );
    expect(html.indexOf('data-testid="coordinator-seats"')).toBeLessThan(
      html.indexOf('data-testid="coordinator-delegates"'),
    );
  });

  it('pairs the initial local time with its server-clock offset sample', () => {
    const localSample = view.serverNow - 500;
    const clock = vi
      .spyOn(Date, 'now')
      .mockReturnValueOnce(localSample)
      .mockReturnValueOnce(view.serverNow);

    try {
      const html = renderToString(
        <CoordinatorConsole
          view={view}
          presenterPath="/tv/test"
          onCreatePresenterPairing={async () => ({
            code: 'A'.repeat(43),
            expiresAt: 1_800_000_600_000,
          })}
          onCommand={async () => {}}
          onLoadCoordinatorDelegates={onLoadCoordinatorDelegates}
          onSaveCoordinatorDelegates={onSaveCoordinatorDelegates}
          onHeartbeat={onHeartbeat}
        />,
      );

      expect(html).toContain('Time left: 0:30');
      expect(clock).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
    }
  });

  it('disables move-on and shows the countdown on the action', () => {
    const html = renderToString(
      <CoordinatorConsole
        view={{
          ...view,
          coordinatorMinimumAdvanceAt: view.serverNow + 8_000,
        }}
        presenterPath="/tv/test"
        onCreatePresenterPairing={async () => ({
          code: 'A'.repeat(43),
          expiresAt: 1_800_000_600_000,
        })}
        onCommand={async () => {}}
        onLoadCoordinatorDelegates={onLoadCoordinatorDelegates}
        onSaveCoordinatorDelegates={onSaveCoordinatorDelegates}
        onHeartbeat={onHeartbeat}
      />,
    );
    const buttonStart = html.indexOf(
      'data-testid="button-coordinator-move-on"',
    );
    const moveButton = html.slice(buttonStart, html.indexOf('>', buttonStart));

    expect(moveButton).toContain('disabled=""');
    expect(moveButton).toContain('aria-label="Move everyone on"');
    expect(html).toMatch(/>Ready in \d+</);
    expect(html).toContain('Move everyone on in 8 seconds.');
    expect(html).not.toContain('You can move everyone on in');
  });

  it('shows public updates without adding private player details', () => {
    const publicLog: CoordinatorConsoleView['publicLog'] = [
      {
        seq: 3,
        at: 1_800_000_000_000,
        action: 'schedule_shift',
        minutes: 5,
      },
      {
        seq: 4,
        at: 1_800_000_000_000,
        action: 'banishment',
        seat: { id: 'seat-casey', name: 'Casey' },
      },
      {
        seq: 5,
        at: 1_800_000_000_000,
        action: 'seat_departed',
        seat: { id: 'seat-jordan', name: 'Jordan' },
      },
      {
        seq: 6,
        at: 1_800_000_000_000,
        action: 'coordinator_undo',
      },
    ];
    const html = renderToString(
      <CoordinatorConsole
        view={{ ...view, publicLog }}
        presenterPath="/tv/test"
        onCreatePresenterPairing={async () => ({
          code: 'A'.repeat(43),
          expiresAt: 1_800_000_600_000,
        })}
        onCommand={async () => {}}
        onLoadCoordinatorDelegates={onLoadCoordinatorDelegates}
        onSaveCoordinatorDelegates={onSaveCoordinatorDelegates}
        onHeartbeat={onHeartbeat}
      />,
    );

    expect(html).toContain(en.game.latestUpdates);
    expect(html).toContain(en.game.publicLogBanishment('Casey'));
    expect(html).toContain(en.game.publicLogScheduleShift(5));
    expect(html).toContain(en.game.publicLogSeatDeparted('Jordan'));
    expect(html).toContain(en.game.publicLogCoordinatorUndo);
    expect(html).not.toContain('Morgan');
  });

  it('shows undo only as a coordinator action without exposing the saved state', () => {
    const html = renderToString(
      <CoordinatorConsole
        view={{
          ...view,
          coordinatorUndo: { expiresAt: 1_800_000_060_000 },
        }}
        presenterPath="/tv/test"
        onCreatePresenterPairing={async () => ({
          code: 'A'.repeat(43),
          expiresAt: 1_800_000_600_000,
        })}
        onCommand={async () => {}}
        onLoadCoordinatorDelegates={onLoadCoordinatorDelegates}
        onSaveCoordinatorDelegates={onSaveCoordinatorDelegates}
        onHeartbeat={onHeartbeat}
      />,
    );

    expect(html).toContain('Undo last action');
    expect(html).toContain('button-coordinator-undo');
    expect(html).not.toContain('restoreState');
    expect(html).not.toContain('Faithful');
    expect(html).not.toContain('Traitor');
  });

  it('shows PIN lockout alerts only when the coordinator has one', () => {
    const html = renderToString(
      <CoordinatorConsole
        view={{
          ...view,
          coordinatorAlerts: [
            {
              seq: 7,
              at: 1_800_000_000_000,
              code: 'seat_pin_locked',
              seatId: 'seat-alex',
              name: 'Alex',
              lockedUntil: 1_800_000_900_000,
            },
          ],
        }}
        presenterPath="/tv/test"
        onCreatePresenterPairing={async () => ({
          code: 'A'.repeat(43),
          expiresAt: 1_800_000_600_000,
        })}
        onCommand={async () => {}}
        onLoadCoordinatorDelegates={onLoadCoordinatorDelegates}
        onSaveCoordinatorDelegates={onSaveCoordinatorDelegates}
        onHeartbeat={onHeartbeat}
      />,
    );

    expect(html).toContain(en.coordinator.pinLockoutsHeading);
    expect(html).toContain('Alex is locked out after too many PIN attempts');
    expect(html).not.toContain('1234');
  });

  it('shows seat status and offers departure only for active seats', () => {
    const html = renderToString(
      <CoordinatorConsole
        view={{
          ...view,
          seats: [
            { id: 'seat-active', name: 'Alex', status: 'alive' },
            { id: 'seat-departed', name: 'Sam', status: 'departed' },
          ],
        }}
        presenterPath="/tv/test"
        onCreatePresenterPairing={async () => ({
          code: 'A'.repeat(43),
          expiresAt: 1_800_000_600_000,
        })}
        onCommand={async () => {}}
        onLoadCoordinatorDelegates={onLoadCoordinatorDelegates}
        onSaveCoordinatorDelegates={onSaveCoordinatorDelegates}
        onHeartbeat={onHeartbeat}
      />,
    );

    expect(html).toContain('Manage seats');
    expect(html).toContain('Alex');
    expect(html).toContain('Mark as departed');
    expect(html).toContain('Sam');
    expect(html).toContain('Departed');
    expect(html).not.toContain('button-mark-departed-seat-departed');
  });

  it('asks before moving on when some players have not finished', () => {
    expect(getCoordinatorMoveConfirmation({ done: 3, total: 8 })).toBe(
      "5 players haven't finished. Move everyone on anyway?",
    );
    expect(getCoordinatorMoveConfirmation({ done: 7, total: 8 })).toBe(
      "1 player hasn't finished. Move everyone on anyway?",
    );
    expect(getCoordinatorMoveConfirmation({ done: 8, total: 8 })).toBeNull();
  });

  it('requires a separate confirmation before ending the game early', () => {
    expect(getCoordinatorEndConfirmation()).toBe(
      'End this game early? Everyone will see the final result.',
    );
  });

  it('keeps countdowns correct when the device clock is two minutes fast or slow', () => {
    expect(formatCoordinatorCountdown(130_000, 100_000, 220_000)).toBe(
      'Time left: 0:30',
    );
    expect(formatCoordinatorCountdown(250_000, 220_000, 100_000)).toBe(
      'Time left: 0:30',
    );
  });
});
