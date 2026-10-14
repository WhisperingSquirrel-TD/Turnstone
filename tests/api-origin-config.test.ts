import { describe, expect, it } from 'vitest';
import { resolveApiOrigin } from '../artifacts/party-game/src/config';

describe('API origin selection', () => {
  it('uses the artifact shared-proxy path in development, ignoring production config', () => {
    expect(resolveApiOrigin(true, 'https://live.example')).toBeNull();
  });

  it('uses the configured sibling origin only in production', () => {
    expect(resolveApiOrigin(false, 'https://live.example')).toBe(
      'https://live.example',
    );
    expect(resolveApiOrigin(false, undefined)).toBeNull();
  });
});
