import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CoordinatorConsole,
  formatCoordinatorCountdown,
  getCoordinatorEndConfirmation,
  getCoordinatorMoveConfirmation,
  type CoordinatorConsoleView,
} from './CoordinatorConsole';

const view: CoordinatorConsoleView = {
  phase: 'VOTE',
  revote: false,
  paused: false,
  deadline: 1_800_000_030_000,
  serverNow: 1_800_000_000_000,
  progress: { done: 3, total: 8 },
};

describe('CoordinatorConsole', () => {
  it('shows phase, server-clock countdown, aggregate progress and logistics controls', () => {
    const html = renderToString(
      <CoordinatorConsole view={view} onCommand={async () => {}} />,
    );

    expect(html).toContain('The vote');
    expect(html).toContain('Time left: 0:30');
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
