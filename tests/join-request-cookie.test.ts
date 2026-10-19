import { describe, expect, it } from 'vitest';
import { cookieNameForJoinRequest } from '../artifacts/api-server/src/session-auth';

describe('join request cookie names', () => {
  it('are scoped to a request without exposing its identifier', () => {
    const requestId = 'join-request-private-id';
    const cookieName = cookieNameForJoinRequest(requestId);

    expect(cookieName).toMatch(/^oathstone-join-[a-f0-9]{24}$/);
    expect(cookieName).not.toContain(requestId);
    expect(cookieNameForJoinRequest(requestId)).toBe(cookieName);
    expect(cookieNameForJoinRequest('another-request')).not.toBe(cookieName);
  });
});
