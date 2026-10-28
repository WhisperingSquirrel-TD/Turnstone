import { describe, expect, it, vi } from 'vitest';
import {
  createClearDownScheduler,
  isNightlyClearDownTime,
} from '../artifacts/api-server/src/clear-down-scheduler';
import { parseEnvironment } from '../artifacts/api-server/src/config/env';

// D117: one in-process job on the single Reserved VM. Real games are only
// cleared from 04:00 UK; practice games on every hourly run.
describe('clear-down timing', () => {
  it('treats 04:00 UK onwards as the nightly window, in both seasons', () => {
    expect(isNightlyClearDownTime(Date.parse('2026-10-28T03:59:00Z'))).toBe(
      false,
    );
    expect(isNightlyClearDownTime(Date.parse('2026-10-28T04:00:00Z'))).toBe(
      true,
    );
    // British Summer Time: 03:30 UTC is 04:30 in the UK.
    expect(isNightlyClearDownTime(Date.parse('2026-07-15T03:30:00Z'))).toBe(
      true,
    );
    expect(isNightlyClearDownTime(Date.parse('2026-07-15T02:30:00Z'))).toBe(
      false,
    );
  });
});

describe('clear-down scheduler', () => {
  const result = {
    ran: true as const,
    mode: 'dry-run' as const,
    expiredGames: 2,
    practiceGames: 1,
    deleted: 0,
    failed: 0,
  };

  it('runs with the configured mode and logs counts only', async () => {
    const run = vi.fn(async () => result);
    const log = vi.fn();
    const scheduler = createClearDownScheduler({
      mode: 'dry-run',
      now: () => Date.parse('2026-10-28T04:30:00Z'),
      run,
      log,
    });
    await scheduler.runOnce();
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'dry-run', realGames: true }),
    );
    expect(log).toHaveBeenCalledWith({
      mode: 'dry-run',
      expiredGames: 2,
      practiceGames: 1,
      deleted: 0,
      failed: 0,
    });
  });

  it('leaves real games for the nightly window', async () => {
    const run = vi.fn(async () => result);
    const scheduler = createClearDownScheduler({
      mode: 'delete',
      now: () => Date.parse('2026-10-28T01:00:00Z'),
      run,
      log: () => {},
    });
    await scheduler.runOnce();
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'delete', realGames: false }),
    );
  });

  it('never runs when switched off', async () => {
    const run = vi.fn(async () => result);
    const scheduler = createClearDownScheduler({
      mode: 'off',
      now: () => Date.parse('2026-10-28T04:30:00Z'),
      run,
      log: () => {},
    });
    scheduler.start();
    await scheduler.runOnce();
    await scheduler.stop();
    expect(run).not.toHaveBeenCalled();
  });

  it('defaults to dry-run and accepts only off, dry-run or delete', () => {
    const base = {
      DATABASE_URL: 'postgresql://user@localhost:5432/db',
      SESSION_SECRET: 's'.repeat(32),
      PIN_PEPPER: 'p'.repeat(32),
      PORT: '5000',
    };
    expect(parseEnvironment(base).OATHSTONE_CLEARDOWN_MODE).toBe('dry-run');
    expect(
      parseEnvironment({ ...base, OATHSTONE_CLEARDOWN_MODE: 'off' })
        .OATHSTONE_CLEARDOWN_MODE,
    ).toBe('off');
    expect(() =>
      parseEnvironment({ ...base, OATHSTONE_CLEARDOWN_MODE: 'yes' }),
    ).toThrow();
  });
});
