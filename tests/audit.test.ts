import { describe, expect, it } from 'vitest';
import { assessAudit } from '../scripts/src/audit-policy';

const report = (high: number, critical: number) => ({
  metadata: { vulnerabilities: { high, critical, moderate: 1 } },
});

describe('zero-exception audit gate', () => {
  it('passes only well-formed reports with zero high/critical findings', () => {
    expect(assessAudit(report(0, 0), 0).passed).toBe(true);
    // pnpm JSON mode returns 1 even for moderate-only advisories.
    expect(assessAudit(report(0, 0), 1).passed).toBe(true);
  });
  it.each([
    [1, 0],
    [0, 1],
    [2, 3],
  ])('rejects new high/critical findings (%i, %i)', (high, critical) => {
    expect(assessAudit(report(high, critical), 1).passed).toBe(false);
  });
  it.each([
    null,
    {},
    { error: 'registry unavailable' },
    { metadata: { vulnerabilities: { high: -1, critical: 0 } } },
  ])('fails closed on malformed or unavailable audit', (value) => {
    expect(assessAudit(value, 0).passed).toBe(false);
  });
  it.each([null, 2, 127])(
    'fails closed on abnormal process exit %s',
    (status) => {
      expect(assessAudit(report(0, 0), status).passed).toBe(false);
    },
  );
});
