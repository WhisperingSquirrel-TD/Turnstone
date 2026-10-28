import { describe, expect, it } from 'vitest';
import {
  checkGameEndDate,
  formatUkDate,
  gameDeletionDate,
  latestGameEndDate,
  ukCalendarDate,
} from '../lib/shared/src/game-end-date';

// Owner rule (28 October 2026): every real game has a last day in UK calendar
// days, from today up to six months ahead; it is deleted the day after.
const at = (iso: string) => Date.parse(iso);

describe('UK calendar day', () => {
  it('uses the UK date, not the UTC date, late in a summer evening', () => {
    // 23:30 UTC is 00:30 the next day in British Summer Time.
    expect(ukCalendarDate(at('2026-07-15T23:30:00Z'))).toBe('2026-07-16');
  });

  it('follows both clock changes', () => {
    expect(ukCalendarDate(at('2026-03-28T23:30:00Z'))).toBe('2026-03-28');
    expect(ukCalendarDate(at('2026-03-29T23:30:00Z'))).toBe('2026-03-30');
    expect(ukCalendarDate(at('2026-10-24T23:30:00Z'))).toBe('2026-10-25');
    expect(ukCalendarDate(at('2026-10-25T23:30:00Z'))).toBe('2026-10-25');
  });
});

describe('game end date limits', () => {
  const now = at('2026-10-28T12:00:00Z');

  it('accepts today and the furthest allowed day', () => {
    expect(checkGameEndDate('2026-10-28', now)).toEqual({ ok: true });
    expect(latestGameEndDate(now)).toBe('2027-04-28');
    expect(checkGameEndDate('2027-04-28', now)).toEqual({ ok: true });
  });

  it('rejects the past and anything beyond six months', () => {
    expect(checkGameEndDate('2026-10-27', now)).toMatchObject({
      ok: false,
      reason: 'past',
    });
    expect(checkGameEndDate('2027-04-29', now)).toMatchObject({
      ok: false,
      reason: 'too-late',
    });
  });

  it('judges "today" by the UK day at the boundary', () => {
    const lateEvening = at('2026-07-15T23:30:00Z');
    expect(checkGameEndDate('2026-07-15', lateEvening)).toMatchObject({
      ok: false,
      reason: 'past',
    });
    expect(checkGameEndDate('2026-07-16', lateEvening)).toEqual({ ok: true });
  });

  it('clamps six months to the end of a shorter month', () => {
    expect(latestGameEndDate(at('2026-08-31T12:00:00Z'))).toBe('2027-02-28');
  });

  it('rejects malformed and impossible dates', () => {
    for (const value of ['tomorrow', '2026-02-30', '2026-13-01', '26-10-28'])
      expect(checkGameEndDate(value, now)).toMatchObject({
        ok: false,
        reason: 'invalid',
      });
  });

  it('gives each rejection a plain message', () => {
    const past = checkGameEndDate('2026-10-27', now);
    const late = checkGameEndDate('2027-04-29', now);
    expect(past.ok === false && past.message).toBe(
      'The last day of your game cannot be in the past.',
    );
    expect(late.ok === false && late.message).toBe(
      'The last day of your game must be within six months of today.',
    );
  });
});

describe('deletion date', () => {
  it('is the day after the end date, across month and year ends', () => {
    expect(gameDeletionDate('2026-10-28')).toBe('2026-10-29');
    expect(gameDeletionDate('2026-10-31')).toBe('2026-11-01');
    expect(gameDeletionDate('2026-12-31')).toBe('2027-01-01');
  });

  it('formats for UK readers', () => {
    expect(formatUkDate('2026-10-29')).toBe('Thursday 29 October 2026');
  });
});
