import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type TextEntry = { id: string; text: string };

const tasks = (
  JSON.parse(
    readFileSync(
      new URL(
        '../attached_assets/traitor-tasks_1792389710910.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as { tasks: TextEntry[] }
).tasks;

const decoys = (
  JSON.parse(
    readFileSync(
      new URL(
        '../attached_assets/task-decoys_1792389710861.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as { decoys: TextEntry[] }
).decoys;

function textFor(entries: TextEntry[], id: string): string {
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Missing content entry ${id}`);
  return entry.text;
}

function sortedPairs() {
  const sortedTasks = tasks
    .map(({ id, text }) => ({ id, length: text.length, text }))
    .sort((left, right) => left.length - right.length);
  const sortedDecoys = decoys
    .map(({ id, text }) => ({ id, length: text.length, text }))
    .sort((left, right) => left.length - right.length);

  return sortedTasks.map((task, index) => {
    const decoy = sortedDecoys[index];
    return {
      task,
      decoy,
      difference: Math.abs(task.length - decoy.length),
    };
  });
}

function countInBand(
  entries: TextEntry[],
  minimum: number,
  maximum: number,
): number {
  return entries.filter(
    ({ text }) => text.length >= minimum && text.length <= maximum,
  ).length;
}

describe('CP-1 v2.2 local content patch', () => {
  it('uses only the approved replacement wording', () => {
    expect(textFor(tasks, 'task-031')).toBe(
      'Offer a high five to someone nearby, with a smile.',
    );
    expect(textFor(tasks, 'task-007')).toBe(
      'Get someone to ask you what time it is, unprompted.',
    );
    expect(textFor(tasks, 'task-010')).toBe(
      'Get someone to hum or sing a few notes of any song nearby.',
    );
    expect(textFor(tasks, 'task-006')).toBe(
      'Use the phrase "as luck would have it" twice before the next vote.',
    );
    expect(textFor(tasks, 'task-032')).toBe(
      'Get someone to repeat themselves by pretending you did not quite hear.',
    );
    expect(textFor(decoys, 'decoy-040')).toBe(
      'Watch who repeats what others just said, word for word.',
    );
    expect(textFor(decoys, 'decoy-022')).toBe(
      'Notice who asks about the time more than once.',
    );
    expect(textFor(decoys, 'decoy-001')).toBe(
      'Keep watch today: whose answers surprise you most?',
    );
  });

  it('keeps every sorted task-decoy pair within eight characters', () => {
    const pairs = sortedPairs();
    expect(tasks).toHaveLength(decoys.length);
    expect(pairs.filter((pair) => pair.difference > 8)).toEqual([]);
  });

  it('keeps each 20-character length band within two entries', () => {
    const bands = [
      [0, 19],
      [20, 39],
      [40, 59],
      [60, 79],
      [80, 99],
    ] as const;

    for (const [minimum, maximum] of bands) {
      expect(
        Math.abs(
          countInBand(tasks, minimum, maximum) -
            countInBand(decoys, minimum, maximum),
        ),
        `band ${minimum}-${maximum}`,
      ).toBeLessThanOrEqual(2);
    }

    expect(countInBand(tasks, 60, 79)).toBe(15);
    expect(countInBand(tasks, 80, 99)).toBe(18);
    expect(countInBand(decoys, 60, 79)).toBe(17);
    expect(countInBand(decoys, 80, 99)).toBe(16);
  });
});
