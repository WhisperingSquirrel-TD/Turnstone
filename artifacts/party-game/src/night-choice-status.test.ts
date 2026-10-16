import { describe, expect, it } from 'vitest';
import { buildNightChoiceStatusLines } from './night-choice-status';

type PickSlot = {
  slot: 1 | 2;
  round: 1 | 2;
  picks: { seatId: string; choice: string }[];
};

const singleNight = (
  seatId: string,
  choice: string,
  slot: 1 | 2 = 1,
  round: 1 | 2 = 1,
): PickSlot[] => [{ slot, round, picks: [{ seatId, choice }] }];

describe('buildNightChoiceStatusLines', () => {
  it('shows a Faithful only their own prediction and the four exact status lines', () => {
    const lines = buildNightChoiceStatusLines({
      role: 'faithful',
      viewerSeatId: 'faithful-a',
      murderSlots: 1,
      traitorTeam: [],
      choiceSlots: [
        {
          slot: 1,
          round: 1,
          picks: [
            { seatId: 'faithful-a', choice: 'seat-alex' },
            { seatId: 'traitor-a', choice: 'secret-target' },
          ],
        },
      ],
      seats: [
        { id: 'faithful-a', name: 'Morgan' },
        { id: 'traitor-a', name: 'Sam' },
        { id: 'seat-alex', name: 'Alex' },
        { id: 'secret-target', name: 'Hidden name' },
      ],
    });

    expect(lines).toEqual([
      'Your guess: Alex',
      'Guesses stay secret until the end.',
      'Think about who the Traitors fear most.',
      'You can change your guess until the night ends.',
    ]);
    expect(lines.join(' ')).not.toContain('Hidden name');
  });

  it('uses the unanswered Faithful copy and retains exactly four lines', () => {
    const lines = buildNightChoiceStatusLines({
      role: 'faithful',
      viewerSeatId: 'faithful-a',
      murderSlots: 1,
      traitorTeam: [],
      choiceSlots: [],
      seats: [{ id: 'faithful-a', name: 'Morgan' }],
    });

    expect(lines).toEqual([
      "You haven't guessed yet",
      'Guesses stay secret until the end.',
      'Think about who the Traitors fear most.',
      'You can change your guess until the night ends.',
    ]);
  });

  it('uses the one-Traitor lines and reports automatic agreement after a pick', () => {
    const lines = buildNightChoiceStatusLines({
      role: 'traitor',
      viewerSeatId: 'traitor-a',
      murderSlots: 1,
      traitorTeam: [{ id: 'traitor-a', name: 'Sam' }],
      choiceSlots: singleNight('traitor-a', 'seat-alex'),
      seats: [
        { id: 'traitor-a', name: 'Sam' },
        { id: 'seat-alex', name: 'Alex' },
      ],
    });

    expect(lines).toEqual([
      'You picked: Alex',
      'You are choosing alone tonight.',
      'Think about who suspects you most.',
      'All agreed: Alex',
    ]);
  });

  it('shows a fellow Traitor live, leaving a fixed blank row when there is only one', () => {
    const lines = buildNightChoiceStatusLines({
      role: 'traitor',
      viewerSeatId: 'traitor-a',
      murderSlots: 1,
      traitorTeam: [
        { id: 'traitor-a', name: 'Sam' },
        { id: 'traitor-b', name: 'Drew' },
      ],
      choiceSlots: singleNight('traitor-b', 'seat-alex'),
      seats: [
        { id: 'traitor-a', name: 'Sam' },
        { id: 'traitor-b', name: 'Drew' },
        { id: 'seat-alex', name: 'Alex' },
      ],
    });

    expect(lines).toEqual([
      "You haven't picked yet",
      'Drew picked: Alex',
      '',
      'You can change your pick until the night ends.',
    ]);
  });

  it('groups more than two fellow Traitors by their two leading targets', () => {
    const lines = buildNightChoiceStatusLines({
      role: 'traitor',
      viewerSeatId: 'traitor-a',
      murderSlots: 1,
      traitorTeam: [
        { id: 'traitor-a', name: 'Sam' },
        { id: 'traitor-b', name: 'Drew' },
        { id: 'traitor-c', name: 'Alex' },
        { id: 'traitor-d', name: 'Blair' },
      ],
      choiceSlots: [
        {
          slot: 1,
          round: 1,
          picks: [
            { seatId: 'traitor-a', choice: 'seat-one' },
            { seatId: 'traitor-b', choice: 'seat-one' },
            { seatId: 'traitor-c', choice: 'seat-one' },
            { seatId: 'traitor-d', choice: 'seat-two' },
          ],
        },
      ],
      seats: [
        { id: 'traitor-a', name: 'Sam' },
        { id: 'traitor-b', name: 'Drew' },
        { id: 'traitor-c', name: 'Alex' },
        { id: 'traitor-d', name: 'Blair' },
        { id: 'seat-one', name: 'Morgan' },
        { id: 'seat-two', name: 'Taylor' },
      ],
    });

    expect(lines).toEqual([
      'You picked: Morgan',
      '2 picked: Morgan',
      'Blair picked: Taylor',
      'You can change your pick until the night ends.',
    ]);
  });

  it('shows both slots together and uses the newest pick without round labels', () => {
    const lines = buildNightChoiceStatusLines({
      role: 'traitor',
      viewerSeatId: 'traitor-a',
      murderSlots: 2,
      traitorTeam: [
        { id: 'traitor-a', name: 'Sam' },
        { id: 'traitor-b', name: 'Drew' },
      ],
      choiceSlots: [
        {
          slot: 1,
          round: 1,
          picks: [
            { seatId: 'traitor-a', choice: 'old-target' },
            { seatId: 'traitor-b', choice: 'old-target' },
          ],
        },
        {
          slot: 1,
          round: 2,
          picks: [
            { seatId: 'traitor-a', choice: 'seat-one' },
            { seatId: 'traitor-b', choice: 'seat-one' },
          ],
        },
        {
          slot: 2,
          round: 2,
          picks: [
            { seatId: 'traitor-a', choice: 'seat-two' },
            { seatId: 'traitor-b', choice: 'seat-two' },
          ],
        },
      ],
      seats: [
        { id: 'traitor-a', name: 'Sam' },
        { id: 'traitor-b', name: 'Drew' },
        { id: 'old-target', name: 'Old' },
        { id: 'seat-one', name: 'Morgan' },
        { id: 'seat-two', name: 'Taylor' },
      ],
    });

    expect(lines).toEqual([
      'You picked: 1st: Morgan · 2nd: Taylor',
      'Drew picked: 1st: Morgan · 2nd: Taylor',
      '',
      'All agreed: 1st: Morgan · 2nd: Taylor',
    ]);
    expect(lines.join(' ')).not.toMatch(/round [12]/i);
  });
});
