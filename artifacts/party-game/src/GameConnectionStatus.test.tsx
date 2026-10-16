import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GameConnectionStatus } from './GameConnectionStatus';

describe('game connection status', () => {
  it('shows reconnecting until the game view has resynced', () => {
    const html = renderToStaticMarkup(
      <GameConnectionStatus status="reconnecting" />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('Reconnecting...');
  });

  it('shows online only after the game view has resynced', () => {
    const html = renderToStaticMarkup(<GameConnectionStatus status="online" />);

    expect(html).toContain('Online');
    expect(html).not.toContain('Reconnecting...');
  });
});
