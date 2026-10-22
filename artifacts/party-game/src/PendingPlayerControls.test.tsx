import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  PendingPlayerControls,
  PendingPlayerConfirmation,
  getPendingPlayerConfirmation,
  type PendingPlayerControlsProps,
} from './PendingPlayerControls';
import { en } from './locale/en-GB';

const seat = { id: 'seat-1', name: 'Alex', disconnected: true };
const props: PendingPlayerControlsProps = {
  pendingSeats: [seat],
  skippedSeats: [],
  restorableSeats: [],
  busy: false,
  onCommand: async () => true,
};

describe('PendingPlayerControls', () => {
  it('renders nothing when there are no pending, skipped or restorable seats', () => {
    expect(
      renderToString(<PendingPlayerControls {...props} pendingSeats={[]} />),
    ).toBe('');
  });

  it('shows the 60-second grace explanation without premature controls', () => {
    const html = renderToString(
      <PendingPlayerControls
        {...props}
        pendingSeats={[{ ...seat, disconnected: false }]}
      />,
    );
    expect(html).toContain('Alex');
    expect(html).toContain(en.coordinator.pendingActionsGrace);
    expect(html).not.toContain(en.coordinator.skipPendingAction);
    expect(html).not.toContain(en.coordinator.removeDisconnectedPlayer);
  });

  it('puts non-mutating waiting first and does not initially offer a final confirmation', () => {
    const onCommand = vi.fn(async () => true);
    const html = renderToString(
      <PendingPlayerControls {...props} onCommand={onCommand} />,
    );
    expect(html.indexOf(en.coordinator.waitLonger)).toBeLessThan(
      html.indexOf(en.coordinator.skipPendingAction),
    );
    expect(html).toContain('keeps their action pending');
    expect(html).toContain('does not change the game');
    expect(html).not.toContain(en.coordinator.confirmSkip);
    expect(html).not.toContain(en.coordinator.confirmRemove);
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('offers undo and restoration with their limited restoration window', () => {
    const html = renderToString(
      <PendingPlayerControls
        {...props}
        pendingSeats={[]}
        skippedSeats={[{ id: 'skipped', name: 'Sam' }]}
        restorableSeats={[{ id: 'removed', name: 'Jo' }]}
      />,
    );
    expect(html).toContain('Sam');
    expect(html).toContain('Undo skip');
    expect(html).toContain('Jo');
    expect(html).toContain(en.coordinator.restorePendingSeat);
    expect(html).toContain(en.coordinator.restorePendingSeatHelp);
  });

  it('disables all mutation controls while busy and uses 44px targets', () => {
    const html = renderToString(
      <PendingPlayerControls
        {...props}
        busy
        skippedSeats={[{ id: 'skipped', name: 'Sam' }]}
        restorableSeats={[{ id: 'removed', name: 'Jo' }]}
      />,
    );
    for (const button of html.match(/<button\b[^>]*>/g) ?? []) {
      expect(button).toContain('min-h-[44px]');
      if (!button.includes('button-wait-'))
        expect(button).toContain('disabled');
    }
  });
});

describe('PendingPlayerConfirmation', () => {
  it.each([
    [
      'SkipPendingAction',
      en.coordinator.skipActionConfirmation,
      en.coordinator.confirmSkip,
      en.coordinator.confirmRemove,
    ],
    [
      'RemoveDisconnectedSeat',
      en.coordinator.removeSeatConfirmation,
      en.coordinator.confirmRemove,
      en.coordinator.confirmSkip,
    ],
  ] as const)(
    'requires the separate implications for %s',
    (type, message, confirm, other) => {
      const html = renderToString(
        <PendingPlayerConfirmation
          seat={seat}
          type={type}
          busy={false}
          onWait={() => {}}
          onConfirm={() => {}}
        />,
      );
      // Decode the apostrophe escaped by React before comparing locale text.
      expect(html.replaceAll('&#x27;', "'")).toContain(message(seat.name));
      expect(html).toContain(confirm);
      expect(html).not.toContain(other);
      expect(html.indexOf(en.coordinator.waitLonger)).toBeLessThan(
        html.indexOf(`>${confirm}</button>`),
      );
    },
  );

  it('keeps waiting non-mutating and requires explicit confirmation to proceed', () => {
    const onWait = vi.fn();
    const onConfirm = vi.fn();
    const panel = PendingPlayerConfirmation({
      seat,
      type: 'SkipPendingAction',
      busy: false,
      onWait,
      onConfirm,
    });
    const buttons = panel.props.children[1].props.children;
    buttons[0].props.onClick();
    expect(onWait).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    buttons[1].props.onClick();
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe('getPendingPlayerConfirmation', () => {
  const confirmation = { seatId: seat.id, type: 'SkipPendingAction' as const };

  it('clears stale confirmation when the seat disappears or is no longer eligible', () => {
    expect(getPendingPlayerConfirmation(confirmation, [])).toBeNull();
    expect(
      getPendingPlayerConfirmation(confirmation, [
        { ...seat, disconnected: false },
      ]),
    ).toBeNull();
    expect(
      getPendingPlayerConfirmation(confirmation, [{ ...seat, id: 'another' }]),
    ).toBeNull();
    expect(getPendingPlayerConfirmation(null, [seat])).toBeNull();
  });

  it('uses the current seat name for the matching pending seat', () => {
    expect(
      getPendingPlayerConfirmation(confirmation, [
        { ...seat, name: 'Updated' },
      ]),
    ).toEqual({ ...confirmation, seat: { ...seat, name: 'Updated' } });
  });
});
