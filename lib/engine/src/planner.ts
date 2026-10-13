import { recommended, type GameConfig } from '../../shared/src/index';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const MAX_PLAN_HORIZON = 60 * DAY;

export type PlannerStepKind =
  | 'DEAL'
  | 'MISSION'
  | 'DEBATE'
  | 'VOTE'
  | 'VERDICT'
  | 'SHADOW'
  | 'DAWN'
  | 'DEPARTURE'
  | 'ENDGAME';

export type PlannerStep = {
  kind: PlannerStepKind;
  start: string;
  end: string;
  cycle: number | null;
  playersRemaining: number;
};

export type PlannerVariant = 'Relaxed' | 'Standard' | 'Compressed';

export type SchedulePlan = {
  variant: PlannerVariant;
  complete: boolean;
  fits: boolean;
  isEstimate: true;
  finalSize: number;
  cycles: number;
  steps: PlannerStep[];
  adjustments: string[];
  warnings: string[];
};

export type PlannerOptions = {
  timeZone?: string;
  seatLeaveTimes?: readonly { seatId: string; at: string }[];
  stepDurations?: Partial<
    Record<Exclude<PlannerStepKind, 'DEPARTURE'>, number>
  >;
};

export type PlannerResult =
  | {
      ok: true;
      players: number;
      traitors: number;
      finalSize: number;
      eliminations: number;
      cycles: number;
      plans: SchedulePlan[];
    }
  | {
      ok: false;
      code:
        | 'WINDOW_REQUIRED'
        | 'INVALID_WINDOW'
        | 'WINDOW_TOO_SHORT'
        | 'STEP_CANNOT_FIT';
      minimumMinutes: number;
      availableMinutes: number;
    };

type Interval = { start: number; end: number };
type StepDefinition = {
  kind: Exclude<PlannerStepKind, 'DEPARTURE'>;
  durationMinutes: number;
  cycle: number | null;
  eliminations: number;
};
type VariantSettings = {
  debateMinutes: number;
  missionMinutes: number;
  missionLimit: number;
  extraMission: boolean;
  banishments: number;
  murders: number;
  finalSize: number;
  adjustments: string[];
};

function partsAt(
  instant: number,
  formatter: Intl.DateTimeFormat,
): Record<string, number> {
  const parts = formatter.formatToParts(new Date(instant));
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
}

function localDateAt(instant: number, formatter: Intl.DateTimeFormat): string {
  const parts = partsAt(instant, formatter);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function addLocalDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

function localTimeToUtc(
  date: string,
  time: string,
  formatter: Intl.DateTimeFormat,
): number {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  let guess = target;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const actual = partsAt(guess, formatter);
    const represented = Date.UTC(
      actual.year!,
      actual.month! - 1,
      actual.day!,
      actual.hour!,
      actual.minute!,
    );
    const adjustment = target - represented;
    if (adjustment === 0) return guess;
    guess += adjustment;
  }

  return guess;
}

function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals]
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];

  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval });
    } else {
      previous.end = Math.max(previous.end, interval.end);
    }
  }
  return merged;
}

function quietIntervals(
  quiet: readonly { start: string; end: string }[],
  formatter: Intl.DateTimeFormat,
  start: number,
  end: number,
): Interval[] {
  const dates = new Set<string>();
  for (
    let instant = start - 36 * 60 * MINUTE;
    instant <= end + 36 * 60 * MINUTE;
    instant += 6 * 60 * MINUTE
  ) {
    dates.add(localDateAt(instant, formatter));
  }

  const intervals: Interval[] = [];
  for (const date of dates) {
    for (const range of quiet) {
      const startMinute =
        Number(range.start.slice(0, 2)) * 60 + Number(range.start.slice(3));
      const endMinute =
        Number(range.end.slice(0, 2)) * 60 + Number(range.end.slice(3));
      const startAt = localTimeToUtc(date, range.start, formatter);
      const endDate = endMinute <= startMinute ? addLocalDate(date, 1) : date;
      const endAt = localTimeToUtc(endDate, range.end, formatter);
      intervals.push({ start: startAt, end: endAt });
    }
  }
  return mergeIntervals(intervals);
}

function overlapMinutes(
  intervals: readonly Interval[],
  start: number,
  end: number,
): number {
  return (
    mergeIntervals(intervals).reduce(
      (total, interval) =>
        total +
        Math.max(
          0,
          Math.min(end, interval.end) - Math.max(start, interval.start),
        ),
      0,
    ) / MINUTE
  );
}

function nextAvailableStart(
  cursor: number,
  duration: number,
  horizonEnd: number,
  unavailable: readonly Interval[],
): number | null {
  let candidate = cursor;
  for (let attempts = 0; attempts < 20_000; attempts += 1) {
    const end = candidate + duration;
    if (end > horizonEnd) return null;
    const conflict = unavailable.find(
      (interval) => candidate < interval.end && end > interval.start,
    );
    if (!conflict) return candidate;
    candidate = conflict.end;
  }
  return null;
}

function formatDurations(
  config: GameConfig,
  options: PlannerOptions,
): Record<Exclude<PlannerStepKind, 'DEPARTURE'>, number> {
  const formatDefaults = {
    quick: {
      DEAL: 3,
      MISSION: 6,
      DEBATE: 6,
      VOTE: 2,
      VERDICT: 2,
      SHADOW: 2,
      DAWN: 1,
      ENDGAME: 10,
    },
    day: {
      DEAL: 10,
      MISSION: 30,
      DEBATE: 15,
      VOTE: 3,
      VERDICT: 5,
      SHADOW: 15,
      DAWN: 5,
      ENDGAME: 30,
    },
    'multi-day': {
      DEAL: 720,
      MISSION: 720,
      DEBATE: 30,
      VOTE: 10,
      VERDICT: 5,
      SHADOW: 480,
      DAWN: 5,
      ENDGAME: 45,
    },
  } as const;

  const durations: Record<Exclude<PlannerStepKind, 'DEPARTURE'>, number> = {
    ...formatDefaults[config.schedule.format],
    DEBATE:
      config.roundTable.debateMinutes === 15
        ? formatDefaults[config.schedule.format].DEBATE
        : config.roundTable.debateMinutes,
    VOTE:
      config.roundTable.voteMinutes === 3
        ? formatDefaults[config.schedule.format].VOTE
        : config.roundTable.voteMinutes,
    ...options.stepDurations,
  };

  for (const [kind, duration] of Object.entries(durations)) {
    if (!Number.isInteger(duration) || duration < 1) {
      throw new RangeError(
        `${kind} duration must be a positive whole number of minutes`,
      );
    }
  }
  return durations;
}

function definitionsFor(
  config: GameConfig,
  durations: Record<Exclude<PlannerStepKind, 'DEPARTURE'>, number>,
  settings: VariantSettings,
): { definitions: StepDefinition[]; cycles: number } {
  const definitions: StepDefinition[] = [
    {
      kind: 'DEAL',
      durationMinutes: durations.DEAL,
      cycle: null,
      eliminations: 0,
    },
  ];
  let remaining = Math.max(0, config.players.count - settings.finalSize);
  let cycle = 0;

  while (remaining > 0) {
    cycle += 1;
    const cycleEliminations = remaining;
    const banished = Math.min(settings.banishments, cycleEliminations);
    const murdered = Math.min(
      settings.murders,
      Math.max(0, cycleEliminations - banished),
    );
    const halfCycle =
      cycleEliminations < settings.banishments + settings.murders &&
      murdered === 0;
    if (
      config.missions.enabled &&
      cycle <= settings.missionLimit &&
      !halfCycle
    ) {
      definitions.push({
        kind: 'MISSION',
        durationMinutes: settings.missionMinutes,
        cycle,
        eliminations: 0,
      });
      if (settings.extraMission && cycle === 1) {
        definitions.push({
          kind: 'MISSION',
          durationMinutes: settings.missionMinutes,
          cycle,
          eliminations: 0,
        });
      }
    }
    definitions.push({
      kind: 'DEBATE',
      durationMinutes: settings.debateMinutes,
      cycle,
      eliminations: 0,
    });

    definitions.push({
      kind: 'VOTE',
      durationMinutes: durations.VOTE,
      cycle,
      eliminations: 0,
    });
    definitions.push({
      kind: 'VERDICT',
      durationMinutes: durations.VERDICT * banished,
      cycle,
      eliminations: banished,
    });
    remaining -= banished;

    if (murdered > 0 || (settings.murders === 0 && remaining > 0)) {
      definitions.push({
        kind: 'SHADOW',
        durationMinutes: durations.SHADOW,
        cycle,
        eliminations: 0,
      });
      definitions.push({
        kind: 'DAWN',
        durationMinutes: durations.DAWN * Math.max(1, murdered),
        cycle,
        eliminations: murdered,
      });
      remaining -= murdered;
    }
  }

  definitions.push({
    kind: 'ENDGAME',
    durationMinutes: durations.ENDGAME,
    cycle: null,
    eliminations: 0,
  });
  return { definitions, cycles: cycle };
}

function makePlan(
  variant: PlannerVariant,
  config: GameConfig,
  options: PlannerOptions,
  start: number,
  windowEnd: number,
  horizonEnd: number,
  unavailable: readonly Interval[],
  settings: VariantSettings,
  durations: Record<Exclude<PlannerStepKind, 'DEPARTURE'>, number>,
): SchedulePlan {
  const { definitions, cycles } = definitionsFor(config, durations, settings);
  const steps: (PlannerStep & { eliminations: number })[] = [];
  let cursor = start;
  let complete = true;

  for (const definition of definitions) {
    const length = definition.durationMinutes * MINUTE;
    const stepStart = nextAvailableStart(
      cursor,
      length,
      horizonEnd,
      unavailable,
    );
    if (stepStart === null) {
      complete = false;
      break;
    }
    const stepEnd = stepStart + length;
    steps.push({
      kind: definition.kind,
      start: new Date(stepStart).toISOString(),
      end: new Date(stepEnd).toISOString(),
      cycle: definition.cycle,
      playersRemaining: config.players.count,
      eliminations: definition.eliminations,
    });
    cursor = stepEnd;
  }

  for (const departure of options.seatLeaveTimes ?? []) {
    const at = Date.parse(departure.at);
    if (!departure.seatId.trim() || !Number.isFinite(at)) {
      throw new RangeError(
        'Each seat departure needs a seat ID and valid ISO time',
      );
    }
    if (at >= start && at <= windowEnd && at <= cursor) {
      steps.push({
        kind: 'DEPARTURE',
        start: new Date(at).toISOString(),
        end: new Date(at).toISOString(),
        cycle: null,
        playersRemaining: config.players.count,
        eliminations: 1,
      });
    }
  }

  steps.sort((a, b) => {
    const timeA =
      a.kind === 'DEPARTURE' ? Date.parse(a.start) : Date.parse(a.end);
    const timeB =
      b.kind === 'DEPARTURE' ? Date.parse(b.start) : Date.parse(b.end);
    if (timeA !== timeB) return timeA - timeB;
    if (a.kind === 'DEPARTURE' && b.kind !== 'DEPARTURE') return -1;
    if (b.kind === 'DEPARTURE' && a.kind !== 'DEPARTURE') return 1;
    return 0;
  });

  let alive = config.players.count;
  const publicSteps: PlannerStep[] = steps.map((step) => {
    if (step.kind === 'DEPARTURE') {
      alive = Math.max(0, alive - 1);
    } else if (alive > settings.finalSize && step.eliminations > 0) {
      alive = Math.max(settings.finalSize, alive - step.eliminations);
    }
    return {
      kind: step.kind,
      start: step.start,
      end: step.end,
      cycle: step.cycle,
      playersRemaining: alive,
    };
  });

  const fits =
    complete &&
    steps.every(
      (step) => step.kind === 'DEPARTURE' || Date.parse(step.end) <= windowEnd,
    );
  const warnings = [
    'This is an estimate; parity, early wins, protection, cancelled murders and departures may change the actual end time.',
  ];
  if (!fits) {
    warnings.push('This option does not fit the selected time window.');
  }
  if (!complete) {
    warnings.push(
      'A phase cannot fit wholly between the selected quiet and blocked times.',
    );
  }
  if (
    config.schedule.format === 'multi-day' &&
    config.schedule.quiet.length > 0 &&
    publicSteps.some((step) => step.kind === 'SHADOW')
  ) {
    warnings.push(
      'Quiet hours take precedence; shadow steps are moved to a quiet-safe window.',
    );
  }
  if ((options.seatLeaveTimes ?? []).length > 0) {
    warnings.push(
      'A scheduled departure may trigger the endgame or a win earlier.',
    );
  }

  return {
    variant,
    complete,
    fits,
    isEstimate: true,
    finalSize: settings.finalSize,
    cycles,
    steps: publicSteps,
    adjustments: settings.adjustments,
    warnings,
  };
}

function settingsFor(
  config: GameConfig,
  durations: Record<Exclude<PlannerStepKind, 'DEPARTURE'>, number>,
  finalSize: number,
): VariantSettings {
  return {
    debateMinutes: durations.DEBATE,
    missionMinutes: durations.MISSION,
    missionLimit: Number.POSITIVE_INFINITY,
    extraMission: false,
    banishments: config.roundTable.banishments,
    murders: config.traitors.murders,
    finalSize,
    adjustments: [],
  };
}

export function planSchedule(
  config: GameConfig,
  options: PlannerOptions = {},
): PlannerResult {
  const window = config.schedule.window;
  if (!window) {
    return {
      ok: false,
      code: 'WINDOW_REQUIRED',
      minimumMinutes: 0,
      availableMinutes: 0,
    };
  }

  const start = Date.parse(window.start);
  const windowEnd = Date.parse(window.end);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(windowEnd) ||
    windowEnd <= start
  ) {
    return {
      ok: false,
      code: 'INVALID_WINDOW',
      minimumMinutes: 0,
      availableMinutes: 0,
    };
  }

  const timeZone = options.timeZone ?? 'UTC';
  const zone = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  zone.format(new Date(start));
  const horizonEnd = windowEnd + MAX_PLAN_HORIZON;
  const blocked = config.schedule.blocked.map((interval) => ({
    start: Date.parse(interval.start),
    end: Date.parse(interval.end),
  }));
  const quiet = quietIntervals(config.schedule.quiet, zone, start, horizonEnd);
  const unavailable = mergeIntervals([...blocked, ...quiet]);
  const availableMinutes = Math.max(
    0,
    Math.floor(
      (windowEnd - start) / MINUTE -
        overlapMinutes(unavailable, start, windowEnd),
    ),
  );
  const durations = formatDurations(config, options);
  const { traitors: recommendedTraitors, finalSize: recommendedFinal } =
    recommended(config.players.count);
  const traitors =
    config.traitors.number === 'auto'
      ? recommendedTraitors
      : config.traitors.number;
  const finalSize =
    config.endgame.size === 'auto' ? recommendedFinal : config.endgame.size;
  const eliminations = Math.max(0, config.players.count - finalSize);
  const standardSettings = settingsFor(config, durations, finalSize);
  const standard = makePlan(
    'Standard',
    config,
    options,
    start,
    windowEnd,
    horizonEnd,
    unavailable,
    standardSettings,
    durations,
  );
  const relaxedSettings = {
    ...standardSettings,
    debateMinutes: Math.min(
      60,
      durations.DEBATE + (config.schedule.format === 'quick' ? 2 : 10),
    ),
    extraMission: config.missions.enabled,
    adjustments: config.missions.enabled
      ? ['One additional mission scheduled because the window allows.']
      : [],
  };
  let relaxed = makePlan(
    'Relaxed',
    config,
    options,
    start,
    windowEnd,
    horizonEnd,
    unavailable,
    relaxedSettings,
    durations,
  );
  if (relaxedSettings.extraMission && !relaxed.fits) {
    const withoutExtraMission = {
      ...relaxedSettings,
      extraMission: false,
      adjustments: [],
    };
    relaxed = makePlan(
      'Relaxed',
      config,
      options,
      start,
      windowEnd,
      horizonEnd,
      unavailable,
      withoutExtraMission,
      durations,
    );
  }

  const compressionSteps: {
    settings: Partial<VariantSettings>;
    adjustment: string;
  }[] = [];
  if (standardSettings.debateMinutes > 2) {
    compressionSteps.push({
      settings: { debateMinutes: 2 },
      adjustment: 'Debates shortened to the two-minute minimum.',
    });
  }
  if (
    config.missions.enabled &&
    standard.cycles > 1 &&
    standardSettings.missionLimit > 1
  ) {
    compressionSteps.push({
      settings: { missionLimit: 1 },
      adjustment: 'Missions dropped after cycle one.',
    });
  }
  if (standardSettings.banishments < 2) {
    compressionSteps.push({
      settings: { banishments: 2 },
      adjustment: 'Up to two banishments scheduled per cycle.',
    });
  }
  if (standardSettings.murders < 2) {
    compressionSteps.push({
      settings: { murders: 2 },
      adjustment: 'Up to two murders scheduled per cycle.',
    });
  }
  const raisedFinalSize = Math.min(config.players.count, 8, finalSize + 1);
  if (raisedFinalSize > finalSize) {
    compressionSteps.push({
      settings: { finalSize: raisedFinalSize },
      adjustment: 'Final size raised by one player.',
    });
  }
  let compressedSettings = { ...standardSettings, adjustments: [] as string[] };
  let compressed = makePlan(
    'Compressed',
    config,
    options,
    start,
    windowEnd,
    horizonEnd,
    unavailable,
    compressedSettings,
    durations,
  );
  for (const compression of compressionSteps) {
    compressedSettings = {
      ...compressedSettings,
      ...compression.settings,
      adjustments: [...compressedSettings.adjustments, compression.adjustment],
    };
    compressed = makePlan(
      'Compressed',
      config,
      options,
      start,
      windowEnd,
      horizonEnd,
      unavailable,
      compressedSettings,
      durations,
    );
    if (compressed.fits) break;
  }

  if (!compressed.complete) {
    const minimumMinutes = definitionsFor(
      config,
      durations,
      compressedSettings,
    ).definitions.reduce(
      (total, definition) => total + definition.durationMinutes,
      0,
    );
    return {
      ok: false,
      code: 'STEP_CANNOT_FIT',
      minimumMinutes,
      availableMinutes,
    };
  }

  if (!compressed.fits) {
    const finalStep = compressed.steps.at(-1);
    const minimumMinutes = finalStep
      ? Math.ceil((Date.parse(finalStep.end) - start) / MINUTE)
      : 0;
    return {
      ok: false,
      code: 'WINDOW_TOO_SHORT',
      minimumMinutes: Math.max(minimumMinutes, availableMinutes + 1),
      availableMinutes,
    };
  }

  const plans = [relaxed, standard, compressed];
  for (const plan of plans) {
    if (traitors > config.players.count * 0.3) {
      plan.warnings.push('Traitors exceed 30% of the seats.');
    }
    if (traitors === 1 && config.players.count > 9) {
      plan.warnings.push('One Traitor with more than nine seats.');
    }
    if (plan.finalSize > config.players.count / 2) {
      plan.warnings.push('Final size is greater than half of the seats.');
    }
    if (plan.cycles < traitors) {
      plan.warnings.push('There are fewer planned cycles than Traitors.');
    }
  }
  return {
    ok: true,
    players: config.players.count,
    traitors,
    finalSize,
    eliminations,
    cycles: standard.cycles,
    plans,
  };
}
