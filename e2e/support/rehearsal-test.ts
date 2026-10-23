import { test as base } from '@playwright/test';

type RehearsalWorkerFixtures = {
  rehearsalDatabase: void;
};

// All real-server rehearsal files share @workspace/db's module-level pool
// inside a reused Playwright worker. Only that worker may close it: a file's
// afterAll runs before the next file and would leave its cached pool ended.
export const test = base.extend<object, RehearsalWorkerFixtures>({
  rehearsalDatabase: [
    // eslint-disable-next-line no-empty-pattern -- No worker dependencies are required.
    async ({}, use) => {
      const { pool } = await import('@workspace/db');
      try {
        await use();
      } finally {
        await pool.end();
      }
    },
    { scope: 'worker', auto: true },
  ],
});
