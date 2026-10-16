export type ChoiceOption = { id: string; name: string };
export type ChoiceSeat = { id: string };
export type ChoicePhase = 'VOTE' | 'FINAL_BANISH' | 'SHADOW' | 'FINAL_VOTE';

type OrderChoiceOptionsInput = {
  choices: ChoiceOption[];
  seats: ChoiceSeat[];
  phase: string | null | undefined;
  seed: string;
};

function seededChoiceRandom(seed: string) {
  let state = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 0x01000193) >>> 0;
  }

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function orderChoiceOptions({
  choices,
  seats,
  phase,
  seed,
}: OrderChoiceOptionsInput): ChoiceOption[] {
  if (phase === 'VOTE' || phase === 'FINAL_BANISH') {
    return [...choices].sort((left, right) =>
      left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }),
    );
  }
  if (
    phase !== 'SHADOW' ||
    choices.length < 2 ||
    choices.some((choice) => !seats.some((seat) => seat.id === choice.id))
  )
    return choices;

  const random = seededChoiceRandom(seed);
  const shuffled = choices.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[otherIndex]] = [
      shuffled[otherIndex]!,
      shuffled[index]!,
    ];
  }
  return shuffled;
}
