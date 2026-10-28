// Game end dates are UK calendar days (Europe/London), from today up to six
// months ahead. A game is deleted the day after its end date (D117).

export const GAME_END_DATE_TIME_ZONE = 'Europe/London';
export const GAME_END_DATE_MAX_MONTHS = 6;

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

const ukDateParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: GAME_END_DATE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function partsToIso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The UK calendar date (YYYY-MM-DD) at the given instant. */
export function ukCalendarDate(now: number): string {
  const parts = Object.fromEntries(
    ukDateParts
      .formatToParts(new Date(now))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Parses a real calendar date; returns null for malformed or impossible dates. */
export function parseIsoDate(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = isoDatePattern.exec(value);
  if (!match) return null;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  )
    return null;
  return { year, month, day };
}

export function addDays(date: string, days: number): string {
  const parsed = parseIsoDate(date);
  if (!parsed) throw new Error('Invalid date');
  const next = new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day + days),
  );
  return partsToIso(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
  );
}

function addMonthsClamped(date: string, months: number): string {
  const parsed = parseIsoDate(date);
  if (!parsed) throw new Error('Invalid date');
  const monthIndex = parsed.month - 1 + months;
  const year = parsed.year + Math.floor(monthIndex / 12);
  const month = (((monthIndex % 12) + 12) % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return partsToIso(year, month, Math.min(parsed.day, lastDay));
}

/** The furthest end date the organiser may choose today. */
export function latestGameEndDate(now: number): string {
  return addMonthsClamped(ukCalendarDate(now), GAME_END_DATE_MAX_MONTHS);
}

export type GameEndDateCheck =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'past' | 'too-late'; message: string };

export function checkGameEndDate(value: string, now: number): GameEndDateCheck {
  if (!parseIsoDate(value))
    return {
      ok: false,
      reason: 'invalid',
      message: 'Choose the last day of your game.',
    };
  if (value < ukCalendarDate(now))
    return {
      ok: false,
      reason: 'past',
      message: 'The last day of your game cannot be in the past.',
    };
  if (value > latestGameEndDate(now))
    return {
      ok: false,
      reason: 'too-late',
      message: 'The last day of your game must be within six months of today.',
    };
  return { ok: true };
}

/** The UK day on which the game and everything in it is deleted. */
export function gameDeletionDate(endDate: string): string {
  return addDays(endDate, 1);
}

const ukLongDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** "Thursday 29 October 2026" for a YYYY-MM-DD calendar date. */
export function formatUkDate(date: string): string {
  const parsed = parseIsoDate(date);
  if (!parsed) throw new Error('Invalid date');
  return ukLongDate
    .format(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)))
    .replace(',', '');
}
