import { describe, expect, it } from 'vitest';
import {
  buildConversationPromptHistory,
  conversationPromptLibrary,
  derivePublicPromptFacts,
  eligibleConversationPrompts,
  isConversationChallenge,
  renderConversationPromptText,
  type PublicPromptFacts,
  type PromptPublicView,
} from './conversation-prompts';

const quietDay = (dayNumber: number): PublicPromptFacts => ({
  dayNumber,
  remainingPlayers: 8,
  lastBanishmentName: null,
  lastDawnVictimNames: null,
});

describe('conversation prompts', () => {
  it('selects the same three prompts for the same game and day', () => {
    const days = [quietDay(1), quietDay(2), quietDay(3)];
    const first = buildConversationPromptHistory('game-42', days).at(-1)!;
    const second = buildConversationPromptHistory('game-42', days).at(-1)!;

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(new Set(first.map((prompt) => prompt.id)).size).toBe(3);
    expect(
      buildConversationPromptHistory('another-game', days)
        .at(-1)!
        .map((prompt) => prompt.id),
    ).not.toEqual(first.map((prompt) => prompt.id));
  });

  it('uses fresh prompts first and repeats only when fewer than three fit the rules', () => {
    const days = Array.from({ length: 8 }, (_, index) => quietDay(index + 2));
    const history = buildConversationPromptHistory('long-game', days);
    const seen = new Set<string>();

    expect(history).toHaveLength(8);
    history.forEach((selected, index) => {
      const eligible = eligibleConversationPrompts(days[index]!);
      const fresh = eligible.filter((prompt) => !seen.has(prompt.id));
      const freshSlots =
        fresh.filter((prompt) => !isConversationChallenge(prompt)).length +
        Math.min(1, fresh.filter(isConversationChallenge).length);

      expect(selected).toHaveLength(3);
      expect(new Set(selected.map((prompt) => prompt.id)).size).toBe(3);
      expect(
        selected.filter(isConversationChallenge).length,
      ).toBeLessThanOrEqual(1);
      expect(selected.filter((prompt) => !seen.has(prompt.id)).length).toBe(
        Math.min(3, freshSlots),
      );
      selected.forEach((prompt) => seen.add(prompt.id));
    });

    const eligiblePromptIds = new Set(
      days.flatMap((facts) =>
        eligibleConversationPrompts(facts).map((prompt) => prompt.id),
      ),
    );
    expect(seen.size).toBe(eligiblePromptIds.size);
  });

  it('matches only prompts whose conditions are supported by public facts', () => {
    const facts: PublicPromptFacts = {
      dayNumber: 3,
      remainingPlayers: 6,
      lastBanishmentName: 'Mina',
      lastDawnVictimNames: ['Rory', 'Lena'],
    };
    const eligible = eligibleConversationPrompts(facts);
    const ids = new Set(eligible.map((prompt) => prompt.id));

    expect(ids).toContain('a1');
    expect(ids).toContain('b1');
    expect(ids).toContain('n1');
    expect(ids).toContain('f1');
    expect(ids).toContain('c1');
    expect(ids).not.toContain('d1');
    expect(ids).not.toContain('z1');
    expect(ids).not.toContain('m1');
    expect(eligible.filter(isConversationChallenge)).toHaveLength(7);
  });

  it('keeps event-referencing prompts out of day one before those events happen', () => {
    const dayOne = eligibleConversationPrompts(quietDay(1));

    expect(dayOne.map((prompt) => prompt.text).join('\n')).not.toMatch(
      /\b(votes?|voted|voting|banishment|banished|nights?|shields?)\b/i,
    );
  });

  it('gates yesterday and vote prompts on the matching public history', () => {
    const dayOneIds = new Set(
      eligibleConversationPrompts(quietDay(1)).map((prompt) => prompt.id),
    );
    expect(dayOneIds).not.toContain('a2');
    expect(dayOneIds).not.toContain('a7');
    expect(dayOneIds).not.toContain('c2');
    expect(dayOneIds).not.toContain('c3');
    expect(dayOneIds).not.toContain('c6');

    const dayTwoIds = new Set(
      eligibleConversationPrompts({
        ...quietDay(2),
        remainingPlayers: 6,
        lastDawnVictimNames: [],
      }).map((prompt) => prompt.id),
    );
    expect(dayTwoIds).toContain('a2');
    expect(dayTwoIds).toContain('a7');
    expect(dayTwoIds).toContain('c2');
    expect(dayTwoIds).not.toContain('c3');
    expect(dayTwoIds).not.toContain('c6');
    expect(dayTwoIds).not.toContain('f2');
    expect(dayTwoIds).not.toContain('f3');

    const afterBanishmentIds = new Set(
      eligibleConversationPrompts({
        dayNumber: 3,
        remainingPlayers: 6,
        lastBanishmentName: 'Mina',
        lastDawnVictimNames: [],
      }).map((prompt) => prompt.id),
    );
    expect(afterBanishmentIds).toContain('c3');
    expect(afterBanishmentIds).toContain('c6');
    expect(afterBanishmentIds).toContain('f2');
    expect(afterBanishmentIds).toContain('f3');
  });

  it('keeps M7 prompts hidden by default and allows at most one challenge', () => {
    const facts = {
      ...quietDay(4),
      remainingPlayers: 5,
      lastBanishmentName: 'Mina',
      lastDawnVictimNames: [],
    };
    const eligible = eligibleConversationPrompts(facts);
    expect(eligible.some((prompt) => prompt.when === 'm7')).toBe(false);

    const selected = buildConversationPromptHistory('game-42', [facts]).at(-1)!;
    expect(selected).toHaveLength(3);
    expect(selected.filter(isConversationChallenge).length).toBeLessThanOrEqual(
      1,
    );
  });

  it('renders templates using only public names and the public player count', () => {
    const facts: PublicPromptFacts = {
      dayNumber: 3,
      remainingPlayers: 6,
      lastBanishmentName: 'Mina',
      lastDawnVictimNames: ['Rory', 'Lena'],
    };
    const promptText = (id: string) =>
      renderConversationPromptText(
        conversationPromptLibrary.find((prompt) => prompt.id === id)!,
        facts,
      );

    expect(promptText('b1')).toContain('Mina');
    expect(promptText('n1')).toContain('Rory and Lena');
    expect(promptText('f1')).toContain('6');
    expect(
      ['b1', 'n1', 'f1'].every((id) => !/\{[^}]+\}/.test(promptText(id))),
    ).toBe(true);
  });

  it('derives previous-day prompts only from the public event history', () => {
    const view: PromptPublicView = {
      id: 'game-public-history',
      cycle: 2,
      seats: [
        { id: 'seat-a', name: 'Mina', status: 'alive' },
        { id: 'seat-b', name: 'Rory', status: 'banished' },
        { id: 'seat-c', name: 'Lena', status: 'murdered' },
        { id: 'seat-d', name: 'Sam', status: 'alive' },
      ],
      publicLog: [
        {
          seq: 1,
          at: 1,
          action: 'banishment',
          seat: { id: 'seat-b', name: 'Rory' },
        },
        {
          seq: 2,
          at: 2,
          action: 'dawn',
          victims: [{ id: 'seat-c', name: 'Lena' }],
        },
      ],
    };

    expect(derivePublicPromptFacts(view)).toEqual([
      {
        dayNumber: 1,
        remainingPlayers: 4,
        lastBanishmentName: null,
        lastDawnVictimNames: null,
      },
      {
        dayNumber: 2,
        remainingPlayers: 2,
        lastBanishmentName: 'Rory',
        lastDawnVictimNames: ['Lena'],
      },
    ]);
  });

  it('uses only public placeholders and keeps every supplied prompt short', () => {
    expect(conversationPromptLibrary).toHaveLength(35);
    expect(
      new Set(conversationPromptLibrary.map((prompt) => prompt.id)).size,
    ).toBe(conversationPromptLibrary.length);

    const privatePlaceholders = conversationPromptLibrary.flatMap((prompt) =>
      [...prompt.text.matchAll(/\{([^}]+)\}/g)]
        .map((match) => match[1])
        .filter(
          (placeholder) => !['name', 'names', 'count'].includes(placeholder),
        ),
    );

    expect(privatePlaceholders).toEqual([]);
    expect(
      conversationPromptLibrary.every((prompt) => prompt.text.length < 140),
    ).toBe(true);
  });
});
