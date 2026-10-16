export type NightStatusChoiceSlot = {
  slot: 1 | 2;
  round: 1 | 2;
  picks: { seatId: string; choice: string }[];
};

export type NightStatusSeat = { id: string; name: string };
export type NightStatusTraitor = { id: string; name: string };

type NightChoiceStatusInput = {
  role: 'traitor' | 'faithful' | null;
  viewerSeatId: string;
  murderSlots: number;
  traitorTeam: NightStatusTraitor[];
  choiceSlots: NightStatusChoiceSlot[];
  seats: NightStatusSeat[];
};

type StoredPick = { choice: string; round: 1 | 2 };

function slotOrdinal(slot: 1 | 2): string {
  return slot === 1 ? '1st' : '2nd';
}

function nameFor(id: string | undefined, seatsById: Map<string, string>) {
  return id ? (seatsById.get(id) ?? 'Unknown player') : 'not picked yet';
}

function buildLatestPicks(
  choiceSlots: NightStatusChoiceSlot[],
): Map<1 | 2, Map<string, StoredPick>> {
  const result = new Map<1 | 2, Map<string, StoredPick>>([
    [1, new Map()],
    [2, new Map()],
  ]);
  for (const entry of choiceSlots) {
    const slotPicks = result.get(entry.slot)!;
    for (const pick of entry.picks) {
      const current = slotPicks.get(pick.seatId);
      if (!current || entry.round >= current.round) {
        slotPicks.set(pick.seatId, {
          choice: pick.choice,
          round: entry.round,
        });
      }
    }
  }
  return result;
}

function formatTargets(
  slotCount: number,
  picksBySlot: Map<1 | 2, Map<string, StoredPick>>,
  seatId: string,
  seatsById: Map<string, string>,
): string {
  const activeSlots = slotCount === 2 ? ([1, 2] as const) : ([1] as const);
  return activeSlots
    .map((slot) => {
      const target = picksBySlot.get(slot)?.get(seatId)?.choice;
      const value = nameFor(target, seatsById);
      return slotCount === 1 ? value : `${slotOrdinal(slot)}: ${value}`;
    })
    .join(' · ');
}

function pickedAnySlot(
  picksBySlot: Map<1 | 2, Map<string, StoredPick>>,
  seatId: string,
  slotCount: number,
): boolean {
  return [1, 2]
    .slice(0, slotCount)
    .some((slot) => picksBySlot.get(slot as 1 | 2)?.has(seatId));
}

function allTraitorsAgree(
  traitorTeam: NightStatusTraitor[],
  picksBySlot: Map<1 | 2, Map<string, StoredPick>>,
  slotCount: number,
): boolean {
  if (!traitorTeam.length) return false;
  return [1, 2].slice(0, slotCount).every((slot) => {
    const choices = traitorTeam.map(
      (traitor) =>
        picksBySlot.get(slot as 1 | 2)?.get(traitor.id)?.choice ?? null,
    );
    return (
      Boolean(choices[0]) && choices.every((choice) => choice === choices[0])
    );
  });
}

function fellowTraitorLines(
  viewerSeatId: string,
  traitorTeam: NightStatusTraitor[],
  picksBySlot: Map<1 | 2, Map<string, StoredPick>>,
  seatsById: Map<string, string>,
  slotCount: number,
): [string, string] {
  const fellows = traitorTeam
    .filter((traitor) => traitor.id !== viewerSeatId)
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));

  if (!fellows.length) {
    return [
      'You are choosing alone tonight.',
      'Think about who suspects you most.',
    ];
  }

  const entries = fellows.map((fellow) => {
    if (!pickedAnySlot(picksBySlot, fellow.id, slotCount)) {
      return {
        key: `waiting:${fellow.id}`,
        count: 1,
        line: `Waiting for ${fellow.name}`,
        sortTarget: '',
      };
    }
    const targetSignature = [1, 2]
      .slice(0, slotCount)
      .map(
        (slot) => picksBySlot.get(slot as 1 | 2)?.get(fellow.id)?.choice ?? '',
      )
      .join('|');
    return {
      key: `target:${targetSignature}`,
      count: 1,
      line: `${fellow.name} picked: ${formatTargets(slotCount, picksBySlot, fellow.id, seatsById)}`,
      sortTarget: formatTargets(slotCount, picksBySlot, fellow.id, seatsById),
    };
  });

  if (fellows.length <= 2) {
    return [entries[0]?.line ?? '', entries[1]?.line ?? ''];
  }

  const grouped = new Map<
    string,
    { count: number; line: string; sortTarget: string }
  >();
  for (const entry of entries) {
    const current = grouped.get(entry.key);
    if (current) {
      current.count += 1;
      continue;
    }
    grouped.set(entry.key, {
      count: entry.count,
      line: entry.line,
      sortTarget: entry.sortTarget,
    });
  }

  return [...grouped.values()]
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.sortTarget.localeCompare(right.sortTarget, 'en') ||
        left.line.localeCompare(right.line, 'en'),
    )
    .slice(0, 2)
    .map((group) =>
      group.count > 1
        ? `${group.count} picked: ${group.sortTarget}`
        : group.line,
    )
    .concat(['', ''])
    .slice(0, 2) as [string, string];
}

export function buildNightChoiceStatusLines(
  input: NightChoiceStatusInput,
): [string, string, string, string] {
  const slotCount = input.murderSlots === 2 ? 2 : 1;
  const seatsById = new Map(input.seats.map((seat) => [seat.id, seat.name]));
  const picksBySlot = buildLatestPicks(input.choiceSlots);

  if (input.role !== 'traitor') {
    const hasGuess = pickedAnySlot(picksBySlot, input.viewerSeatId, slotCount);
    return [
      hasGuess
        ? `Your guess: ${formatTargets(slotCount, picksBySlot, input.viewerSeatId, seatsById)}`
        : "You haven't guessed yet",
      'Guesses stay secret until the end.',
      'Think about who the Traitors fear most.',
      'You can change your guess until the night ends.',
    ];
  }

  const hasPick = pickedAnySlot(picksBySlot, input.viewerSeatId, slotCount);
  const ownLine = hasPick
    ? `You picked: ${formatTargets(slotCount, picksBySlot, input.viewerSeatId, seatsById)}`
    : "You haven't picked yet";
  const [fellowOne, fellowTwo] = fellowTraitorLines(
    input.viewerSeatId,
    input.traitorTeam,
    picksBySlot,
    seatsById,
    slotCount,
  );
  const agreementLine = allTraitorsAgree(
    input.traitorTeam,
    picksBySlot,
    slotCount,
  )
    ? `All agreed: ${formatTargets(slotCount, picksBySlot, input.viewerSeatId, seatsById)}`
    : 'You can change your pick until the night ends.';

  return [ownLine, fellowOne, fellowTwo, agreementLine];
}
