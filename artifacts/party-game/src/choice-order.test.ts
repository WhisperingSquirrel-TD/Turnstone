import { describe, expect, it } from 'vitest';
import { orderChoiceOptions } from './choice-order';

const choices = [
  { id: 's6', name: 'Taylor' },
  { id: 's2', name: 'Blair' },
  { id: 's4', name: 'Morgan' },
  { id: 's1', name: 'Alex' },
  { id: 's5', name: 'Sam' },
  { id: 's3', name: 'Casey' },
];

const seats = choices.map(({ id, name }) => ({ id, name }));

describe('orderChoiceOptions', () => {
  it('keeps banishment choices alphabetical', () => {
    expect(
      orderChoiceOptions({
        choices,
        seats,
        phase: 'VOTE',
        seed: 'game:seat-a',
      }).map((choice) => choice.name),
    ).toEqual(['Alex', 'Blair', 'Casey', 'Morgan', 'Sam', 'Taylor']);
    expect(
      orderChoiceOptions({
        choices,
        seats,
        phase: 'FINAL_BANISH',
        seed: 'game:seat-a',
      }).map((choice) => choice.name),
    ).toEqual(['Alex', 'Blair', 'Casey', 'Morgan', 'Sam', 'Taylor']);
  });

  it('shuffles the same night candidate set deterministically per seat', () => {
    const firstSeatOrder = orderChoiceOptions({
      choices,
      seats,
      phase: 'SHADOW',
      seed: 'game:seat-a:1',
    });
    const secondSeatOrder = orderChoiceOptions({
      choices,
      seats,
      phase: 'SHADOW',
      seed: 'game:seat-b:1',
    });

    expect(
      orderChoiceOptions({
        choices,
        seats,
        phase: 'SHADOW',
        seed: 'game:seat-a:1',
      }),
    ).toEqual(firstSeatOrder);
    expect(firstSeatOrder.map((choice) => choice.id).sort()).toEqual(
      choices.map((choice) => choice.id).sort(),
    );
    expect(secondSeatOrder.map((choice) => choice.id).sort()).toEqual(
      choices.map((choice) => choice.id).sort(),
    );
    expect(firstSeatOrder.map((choice) => choice.id)).not.toEqual(
      secondSeatOrder.map((choice) => choice.id),
    );
  });

  it('preserves the endgame choice order', () => {
    const endgameChoices = [
      { id: 'end', name: 'End the game' },
      { id: 'continue', name: 'Continue playing' },
    ];
    expect(
      orderChoiceOptions({
        choices: endgameChoices,
        seats,
        phase: 'FINAL_VOTE',
        seed: 'game:seat-a',
      }),
    ).toEqual(endgameChoices);
  });
});
