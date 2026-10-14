import { describe, expect, it } from 'vitest';
import { isAllowedSocketOrigin } from '../artifacts/api-server/src/socket-origin';

describe('Socket.IO origin validation', () => {
  const allowedOrigins = ['https://turnstone.example', 'http://127.0.0.1:3111'];

  it('requires exact allow-list membership when Origin is present', () => {
    expect(
      isAllowedSocketOrigin(
        { origin: 'https://turnstone.example', host: 'attacker.example' },
        allowedOrigins,
      ),
    ).toBe(true);
    expect(
      isAllowedSocketOrigin(
        { origin: 'https://attacker.example', host: 'turnstone.example' },
        allowedOrigins,
      ),
    ).toBe(false);
  });

  it('accepts same-origin polling when Origin is omitted and Host is allow-listed', () => {
    expect(
      isAllowedSocketOrigin({ host: 'turnstone.example' }, allowedOrigins),
    ).toBe(true);
    expect(
      isAllowedSocketOrigin({ host: '127.0.0.1:3111' }, allowedOrigins),
    ).toBe(true);
  });

  it('rejects Origin-less requests with a different or missing Host', () => {
    expect(
      isAllowedSocketOrigin({ host: 'attacker.example' }, allowedOrigins),
    ).toBe(false);
    expect(isAllowedSocketOrigin({}, allowedOrigins)).toBe(false);
    expect(isAllowedSocketOrigin({ host: 'turnstone.example' }, [])).toBe(
      false,
    );
  });

  it('does not accept a different port for an Origin-less request', () => {
    expect(
      isAllowedSocketOrigin({ host: '127.0.0.1:3112' }, allowedOrigins),
    ).toBe(false);
  });
});
