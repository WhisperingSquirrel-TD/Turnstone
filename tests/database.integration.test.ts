import { afterAll, expect, it } from 'vitest';
import { db, pool } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { createApp } from '../artifacts/api-server/src/app';
import request from 'supertest';

afterAll(async () => {
  await pool.end();
});

it('uses real PostgreSQL with the committed foundation migration', async () => {
  const result = await db.execute(
    sql`select version from foundation_meta where id = 1`,
  );
  expect(result.rows).toEqual([{ version: 1 }]);
  const app = createApp(async () => {
    await db.execute(sql`select version from foundation_meta where id = 1`);
  });
  expect((await request(app).get('/api/readyz')).status).toBe(200);
});
