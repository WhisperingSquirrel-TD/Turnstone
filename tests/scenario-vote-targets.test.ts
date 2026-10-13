import { expect, it } from 'vitest';
import { generateConstrainedArray } from '../scripts/src/scenarios/covering-array';
import { runCompleteGame } from '../scripts/src/scenarios/simulate';

it('keeps an aggressive Traitor within a restricted revote candidate set', () => {
  const config = generateConstrainedArray(20261013)[2]!;
  const result = runCompleteGame({
    seed: 21261215,
    strategy: 'aggressive-traitor',
    config,
  });

  expect(result.state.phase).toBe('FINISHED');
}, 60_000);
