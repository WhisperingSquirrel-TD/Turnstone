import type { Event } from '@workspace/engine';

export type ScenarioEngineFault =
  | 'wrong-cycle-tie-break'
  | 'banish-runner-up'
  | 'murder-shielded-seat'
  | 'ignore-missed-task'
  | 'wrong-parity-threshold'
  | 'wrong-random-candidate-set';

/**
 * Test-only seam at the event-store boundary. It models a defective engine
 * response without changing production engine code or weakening the oracle.
 */
export function injectScenarioEngineFault(
  source: readonly Event[],
  fault: ScenarioEngineFault,
): Event[] {
  const events = source.map((event) => ({ ...event }) as Event);

  if (fault === 'wrong-parity-threshold') {
    const index = events.findIndex(
      (event) => event.type === 'GameFinished' && event.reason === 'parity',
    );
    if (index < 0) throw new Error('Fault fixture has no parity finish');
    events.splice(index, 1);
    return events;
  }

  if (fault === 'murder-shielded-seat') {
    const shield = events.find((event) => event.type === 'ShieldsAllocated');
    const dawnIndex = events.findIndex(
      (event) => event.type === 'DawnResolved',
    );
    if (!shield || shield.type !== 'ShieldsAllocated' || dawnIndex < 0)
      throw new Error('Fault fixture has no shielded dawn');
    const target = shield.holders[0];
    if (!target) throw new Error('Fault fixture has no shield holder');
    events[dawnIndex] = {
      ...events[dawnIndex]!,
      victims: [target],
      protected: [],
    } as Event;
    return events;
  }

  if (fault === 'ignore-missed-task') {
    const cancelIndex = events.findIndex(
      (event) => event.type === 'TaskMurderCancelled',
    );
    if (cancelIndex < 0)
      throw new Error('Fault fixture has no task cancellation');
    events[cancelIndex] = {
      ...events[cancelIndex]!,
      cancelled: false,
      traitors: [],
    } as Event;
    return events;
  }

  if (fault === 'wrong-random-candidate-set') {
    const index = events.findIndex(
      (event) => event.type === 'RandomChoiceRecorded',
    );
    if (index < 0) throw new Error('Fault fixture has no random choice');
    const choice = events[index]!;
    if (choice.type !== 'RandomChoiceRecorded')
      throw new Error('Invalid random-choice fixture');
    const extra = 'seat-not-in-the-tie';
    events[index] = {
      ...choice,
      candidates: [...choice.candidates, extra],
    };
    return events;
  }

  const closeIndex = events.findIndex(
    (event) =>
      event.type === 'VoteClosed' &&
      (fault === 'wrong-cycle-tie-break'
        ? event.target === null && !event.revote
        : event.target !== null && !event.revote),
  );
  if (closeIndex < 0) throw new Error('Fault fixture has no completed ballot');
  const close = events[closeIndex]!;
  if (close.type !== 'VoteClosed') throw new Error('Invalid ballot fixture');

  const votes = new Map<string, number>();
  for (const event of events.slice(0, closeIndex)) {
    if (event.type === 'VoteSubmitted')
      votes.set(event.target, (votes.get(event.target) ?? 0) + 1);
  }
  const ranked = [...votes].sort(
    ([leftId, leftCount], [rightId, rightCount]) =>
      rightCount - leftCount || leftId.localeCompare(rightId),
  );
  const replacement =
    fault === 'banish-runner-up'
      ? ranked.find(([id]) => id !== close.target)?.[0]
      : ranked[0]?.[0];
  if (!replacement) throw new Error('Fault fixture has no replacement target');

  events[closeIndex] = { ...close, target: replacement };
  if (fault === 'banish-runner-up') {
    const removalIndex = events.findIndex(
      (event, index) =>
        index > closeIndex &&
        event.type === 'SeatRemoved' &&
        event.reason === 'banished',
    );
    if (removalIndex < 0)
      throw new Error('Fault fixture has no banishment outcome');
    events[removalIndex] = {
      ...events[removalIndex]!,
      seatId: replacement,
    } as Event;
  }
  return events;
}
