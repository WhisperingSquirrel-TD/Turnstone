import type { FullView } from '@workspace/api-client-react';
import promptsJson from './content/conversation-prompts.en-GB.json';

export type PromptWhen =
  | 'always'
  | 'day1'
  | 'afterBanishment'
  | 'afterDawn'
  | 'noDawnVictim'
  | 'fewLeft'
  | 'challenge'
  | 'm7';

export type ConversationPrompt = {
  id: string;
  when: PromptWhen;
  text: string;
};

export type PublicPromptFacts = {
  dayNumber: number;
  remainingPlayers: number;
  lastBanishmentName: string | null;
  lastDawnVictimNames: readonly string[] | null;
  m7Available?: boolean;
};

export type PromptPublicView = Pick<FullView, 'id' | 'cycle' | 'publicLog'> & {
  seats: readonly Pick<FullView['seats'][number], 'id' | 'name' | 'status'>[];
};

export const conversationPromptLibrary =
  promptsJson as readonly ConversationPrompt[];

export function eligibleConversationPrompts(
  facts: PublicPromptFacts,
): readonly ConversationPrompt[] {
  return conversationPromptLibrary.filter((prompt) => {
    switch (prompt.when) {
      case 'always':
      case 'challenge':
        return true;
      case 'day1':
        return facts.dayNumber === 1;
      case 'afterBanishment':
        return Boolean(facts.lastBanishmentName);
      case 'afterDawn':
        return Boolean(facts.lastDawnVictimNames?.length);
      case 'noDawnVictim':
        return (
          facts.lastDawnVictimNames !== null &&
          facts.lastDawnVictimNames !== undefined &&
          facts.lastDawnVictimNames.length === 0
        );
      case 'fewLeft':
        return facts.remainingPlayers <= 6;
      case 'm7':
        return facts.m7Available === true;
    }
  });
}

export function buildConversationPromptHistory(
  gameId: string,
  factsByDay: readonly PublicPromptFacts[],
): ConversationPrompt[][] {
  const usedPromptIds = new Set<string>();

  return factsByDay.map((facts) => {
    const selected = selectPromptsForDay(gameId, facts, usedPromptIds);
    selected.forEach((prompt) => usedPromptIds.add(prompt.id));
    return selected;
  });
}

export function derivePublicPromptFacts(
  view: PromptPublicView,
): PublicPromptFacts[] {
  const publicLog = [...view.publicLog].sort((a, b) => a.seq - b.seq);
  const dawnEntries = publicLog.filter((entry) => entry.action === 'dawn');
  const currentDay = Math.max(1, Math.floor(view.cycle));
  const initialSeatCount = view.seats.length;
  const currentAliveCount = view.seats.filter(
    (seat) => seat.status === 'alive',
  ).length;

  return Array.from({ length: currentDay }, (_, index) => {
    const dayNumber = index + 1;
    const previousDawn = dayNumber > 1 ? dawnEntries[dayNumber - 2] : undefined;
    const precedingDawn =
      dayNumber > 2 ? dawnEntries[dayNumber - 3] : undefined;
    const previousDawnSeq = previousDawn?.seq ?? 0;
    const precedingDawnSeq = precedingDawn?.seq ?? 0;
    const previousDayEvents = previousDawn
      ? publicLog.filter(
          (entry) =>
            entry.seq > precedingDawnSeq && entry.seq <= previousDawnSeq,
        )
      : [];
    const lastBanishment = [...previousDayEvents]
      .reverse()
      .find((entry) => entry.action === 'banishment');
    const removedSeatIds = new Set<string>();

    for (const entry of publicLog) {
      if (entry.seq > previousDawnSeq) break;
      if (entry.action === 'banishment' || entry.action === 'seat_departed') {
        removedSeatIds.add(entry.seat.id);
      } else if (entry.action === 'dawn') {
        entry.victims.forEach((victim) => removedSeatIds.add(victim.id));
      }
    }

    const historicalAliveCount = Math.max(
      0,
      initialSeatCount - removedSeatIds.size,
    );

    return {
      dayNumber,
      remainingPlayers:
        dayNumber === currentDay ? currentAliveCount : historicalAliveCount,
      lastBanishmentName:
        lastBanishment?.action === 'banishment'
          ? lastBanishment.seat.name
          : null,
      lastDawnVictimNames: previousDawn
        ? previousDawn.victims.map((victim) => victim.name)
        : null,
    };
  });
}

export function getDayStartConversationPrompts(
  view: PromptPublicView,
): ConversationPrompt[] {
  return (
    buildConversationPromptHistory(view.id, derivePublicPromptFacts(view)).at(
      -1,
    ) ?? []
  );
}

function selectPromptsForDay(
  gameId: string,
  facts: PublicPromptFacts,
  usedPromptIds: ReadonlySet<string>,
): ConversationPrompt[] {
  const ordered = [...eligibleConversationPrompts(facts)].sort(
    (left, right) => {
      const leftHash = hash(`${gameId}:${facts.dayNumber}:${left.id}`);
      const rightHash = hash(`${gameId}:${facts.dayNumber}:${right.id}`);
      return (
        leftHash - rightHash ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
      );
    },
  );
  const fresh = ordered.filter((prompt) => !usedPromptIds.has(prompt.id));
  const freshChallenge = fresh.find((prompt) => prompt.when === 'challenge');
  const freshOther = fresh.filter((prompt) => prompt.when !== 'challenge');
  const selected: ConversationPrompt[] = [];

  if (freshChallenge) selected.push(freshChallenge);
  for (const prompt of freshOther) {
    if (selected.length === 3) break;
    selected.push(prompt);
  }

  for (const prompt of ordered) {
    if (selected.length === 3) break;
    if (selected.some((chosen) => chosen.id === prompt.id)) continue;
    if (
      prompt.when === 'challenge' &&
      selected.some((chosen) => chosen.when === 'challenge')
    ) {
      continue;
    }
    selected.push(prompt);
  }

  return selected.map((prompt) => ({
    ...prompt,
    text: renderConversationPromptText(prompt, facts),
  }));
}

export function renderConversationPromptText(
  prompt: ConversationPrompt,
  facts: PublicPromptFacts,
): string {
  const names = facts.lastDawnVictimNames ?? [];
  return prompt.text.replace(
    /\{(name|names|count)\}/g,
    (_placeholder, key: string) => {
      if (key === 'name') return facts.lastBanishmentName ?? '';
      if (key === 'names') return formatNames(names);
      return String(facts.remainingPlayers);
    },
  );
}

function formatNames(names: readonly string[]): string {
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  }
  return result >>> 0;
}
