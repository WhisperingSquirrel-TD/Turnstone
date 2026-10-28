import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import type PgModule from '../lib/db/node_modules/@types/pg/index';
import { afterAll, describe, expect, it } from 'vitest';

// Owner run (28 October 2026): production had every table up to 0013 but no
// migration record, so applying 0000 failed with 42P07. The script may record
// the existing migrations only when each one is fully present.
const run = promisify(execFile);
// pg is a dependency of lib/db only; its types come from the root.
const pg = createRequire(import.meta.url)(
  '../lib/db/node_modules/pg',
) as typeof PgModule;
type QueryResultRow = PgModule.QueryResultRow;
const script = join(process.cwd(), 'lib/db/src/migrate-production.ts');
const tsx = join(process.cwd(), 'node_modules/.bin/tsx');
const journal = JSON.parse(
  readFileSync('lib/db/migrations/meta/_journal.json', 'utf8'),
) as { entries: { tag: string }[] };
const baseUrl = new URL(process.env.DATABASE_URL!);
const admin = new pg.Pool({ connectionString: baseUrl.toString(), max: 1 });
const created: string[] = [];

afterAll(async () => {
  for (const name of created)
    await admin.query(`drop database if exists "${name}" with (force)`);
  await admin.end();
});

async function databaseThrough(lastIndex: number): Promise<string> {
  const name = `oathstone_baseline_${randomBytes(4).toString('hex')}`;
  await admin.query(`create database "${name}"`);
  created.push(name);
  const url = new URL(baseUrl.toString());
  url.pathname = `/${name}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  // Apply the committed SQL directly, as a schema push would, with no record.
  for (const { tag } of journal.entries.slice(0, lastIndex + 1))
    for (const statement of readFileSync(
      `lib/db/migrations/${tag}.sql`,
      'utf8',
    ).split('--> statement-breakpoint'))
      if (statement.trim()) await client.query(statement);
  await client.end();
  return url.toString();
}

async function migrate(url: string, extra: Record<string, string> = {}) {
  try {
    const { stdout, stderr } = await run(tsx, [script], {
      env: {
        PATH: process.env.PATH ?? '',
        DATABASE_URL: url,
        OATHSTONE_CONFIRM_PRODUCTION_MIGRATION: 'apply',
        ...extra,
      },
      timeout: 60_000,
    });
    return { code: 0, output: stdout + stderr };
  } catch (error) {
    const failure = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: failure.code ?? 1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    };
  }
}

async function query<T extends QueryResultRow>(url: string, text: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query<T>(text)).rows;
  } finally {
    await client.end();
  }
}

const recorded = (url: string) =>
  query<{ count: string }>(
    url,
    `select count(*)::text as count from information_schema.tables
     where table_schema = 'drizzle' and table_name = '__drizzle_migrations'`,
  ).then(async ([row]) =>
    row!.count === '0'
      ? 0
      : Number(
          (
            await query<{ count: string }>(
              url,
              'select count(*)::text as count from drizzle.__drizzle_migrations',
            )
          )[0]!.count,
        ),
  );

const lastExisting = journal.entries.length - 2;

describe('production migration over unrecorded existing tables', () => {
  it('stops and explains, changing nothing, without the record flag', async () => {
    const url = await databaseThrough(lastExisting);
    const result = await migrate(url);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain(journal.entries[lastExisting]!.tag);
    expect(result.output).toContain('OATHSTONE_RECORD_EXISTING_MIGRATIONS=yes');
    expect(await recorded(url)).toBe(0);
  }, 120_000);

  it('records the present migrations and applies only the new one', async () => {
    const url = await databaseThrough(lastExisting);
    const result = await migrate(url, {
      OATHSTONE_RECORD_EXISTING_MIGRATIONS: 'yes',
    });
    expect(result.output).toContain('Production migrations are up to date.');
    expect(result.code).toBe(0);
    expect(await recorded(url)).toBe(journal.entries.length);
    const columns = await query<{ column_name: string }>(
      url,
      `select column_name from information_schema.columns
       where table_name = 'games' and column_name = 'game_end_date'`,
    );
    expect(columns).toHaveLength(1);
    expect(result.output).not.toContain(baseUrl.password || 'no-password');
  }, 120_000);

  it('accepts an equivalent foreign key under the default Postgres name', async () => {
    // Production, 28 October 2026: game_seat_connections_game_id_fkey with
    // the same definition as the committed game_seat_connections_game_id_games_id_fk.
    const url = await databaseThrough(lastExisting);
    await query(
      url,
      'alter table game_seat_connections rename constraint game_seat_connections_game_id_games_id_fk to game_seat_connections_game_id_fkey',
    );
    const result = await migrate(url, {
      OATHSTONE_RECORD_EXISTING_MIGRATIONS: 'yes',
    });
    expect(result.output).toContain('Production migrations are up to date.');
    expect(result.code).toBe(0);
  }, 120_000);

  it('refuses a foreign key with a different definition', async () => {
    const url = await databaseThrough(lastExisting);
    await query(
      url,
      'alter table game_seat_connections drop constraint game_seat_connections_game_id_games_id_fk',
    );
    await query(
      url,
      'alter table game_seat_connections add constraint game_seat_connections_game_id_fkey foreign key (game_id) references games(id)',
    );
    const result = await migrate(url, {
      OATHSTONE_RECORD_EXISTING_MIGRATIONS: 'yes',
    });
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('partly');
    expect(await recorded(url)).toBe(0);
  }, 120_000);

  it('refuses to record a partly applied migration', async () => {
    const url = await databaseThrough(lastExisting);
    await query(url, 'drop index "game_seat_connections_game_seat_seen_idx"');
    const result = await migrate(url, {
      OATHSTONE_RECORD_EXISTING_MIGRATIONS: 'yes',
    });
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('partly');
    expect(await recorded(url)).toBe(0);
  }, 120_000);
});
