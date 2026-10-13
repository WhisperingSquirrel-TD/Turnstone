import { expect, it } from 'vitest';
import { gameConfigSchema } from '../lib/shared/src/index';

it('rejects enabled Traitor tasks with mutually impossible age filters', () => {
  const result = gameConfigSchema.safeParse({
    tasks: {
      enabled: true,
      filters: ['family', 'adults-only'],
    },
  });
  expect(result.success).toBe(false);
});
