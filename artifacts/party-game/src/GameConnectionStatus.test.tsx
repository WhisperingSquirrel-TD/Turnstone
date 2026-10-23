import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GameConnectionStatus } from './GameConnectionStatus';

describe('game connection status', () => {
  it('shows reconnecting until the game view has resynced', () => {
    const html = renderToStaticMarkup(
      <GameConnectionStatus status="reconnecting" />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('Reconnecting');
  });

  it('uses Live only after the game view has resynced', () => {
    const html = renderToStaticMarkup(<GameConnectionStatus status="online" />);

    expect(html).toContain('Live');
    expect(html).not.toContain('Reconnecting');
  });

  it('labels an offline device with a word as well as a status dot', () => {
    const html = renderToStaticMarkup(
      <GameConnectionStatus status="offline" />,
    );

    expect(html).toContain('Offline');
    expect(html).toContain('aria-hidden="true"');
  });
});
