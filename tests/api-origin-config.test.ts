import { describe, expect, it } from 'vitest';
import { apiUrl } from '../artifacts/party-game/src/api-url';
import { config, resolveApiOrigin } from '../artifacts/party-game/src/config';

describe('API origin selection', () => {
  it('keeps the artifact shared-proxy path when development has no API origin', () => {
    expect(resolveApiOrigin(undefined)).toBeNull();
  });

  it('ignores a legacy sibling API origin in development', () => {
    expect(resolveApiOrigin('http://127.0.0.1:4111')).toBeNull();
  });

  it('keeps REST paths same-origin even when a legacy API host is configured', () => {
    const origin = resolveApiOrigin('https://live.example');
    expect(origin).toBeNull();
    expect(config.apiOrigin).toBeNull();
    expect(apiUrl('/csrf', origin)).toBe('/api/csrf');
  });
});
