export function choiceCompletionScope(step: {
  phase: string;
  round: string;
  slot: string;
}): string {
  if (step.phase !== 'SHADOW') return 'body';
  if (!/^\d+$/.test(step.round) || !/^\d+$/.test(step.slot))
    throw new Error('Missing public night step identity');
  // Dock controls may be portalled out of player-game. Qualify the whole body
  // by the submitted public step, never by a version or private choice.
  return `body:has([data-testid="player-game"][data-phase="SHADOW"][data-shadow-round="${step.round}"][data-shadow-slot="${step.slot}"])`;
}
