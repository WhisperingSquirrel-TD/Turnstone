// Production may hold tables that were created outside the committed
// migrations (for example by a schema push), with no migration record. Then
// applying 0000 fails with 42P07. These helpers check, migration by
// migration, whether every object it creates is already present, so the
// fully present ones can be recorded as applied and only the rest run.
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type pg from 'pg';

export type MigrationObject =
  | { kind: 'table'; name: string }
  | { kind: 'column'; table: string; name: string }
  | { kind: 'index'; name: string }
  | { kind: 'constraint'; name: string };

export type Presence = 'all' | 'none' | 'partial';

export function migrationObjects(sql: string): MigrationObject[] {
  const objects: MigrationObject[] = [];
  for (const [, name] of sql.matchAll(
    /CREATE TABLE(?: IF NOT EXISTS)? "([^"]+)"/gi,
  ))
    objects.push({ kind: 'table', name: name! });
  for (const [, table, name] of sql.matchAll(
    /ALTER TABLE "([^"]+)" ADD COLUMN(?: IF NOT EXISTS)? "([^"]+)"/gi,
  ))
    objects.push({ kind: 'column', table: table!, name: name! });
  for (const [, name] of sql.matchAll(
    /CREATE (?:UNIQUE )?INDEX(?: IF NOT EXISTS)? "([^"]+)"/gi,
  ))
    objects.push({ kind: 'index', name: name! });
  for (const [, name] of sql.matchAll(/CONSTRAINT "([^"]+)"/gi))
    objects.push({ kind: 'constraint', name: name! });
  return objects;
}

export function planBaseline(
  presence: readonly Presence[],
): { ok: true; through: number } | { ok: false; reason: string } {
  const partial = presence.indexOf('partial');
  if (partial !== -1)
    return { ok: false, reason: `migration ${partial} is partly applied` };
  const firstMissing = presence.indexOf('none');
  const through = firstMissing === -1 ? presence.length - 1 : firstMissing - 1;
  if (presence.slice(through + 1).some((state) => state !== 'none'))
    return {
      ok: false,
      reason: `migration ${firstMissing} is missing but a later one is present`,
    };
  return { ok: true, through };
}

const presenceQuery: Record<MigrationObject['kind'], string> = {
  table: `select 1 from information_schema.tables
          where table_schema = 'public' and table_name = $1`,
  column: `select 1 from information_schema.columns
           where table_schema = 'public' and table_name = $2 and column_name = $1`,
  index: `select 1 from pg_indexes where schemaname = 'public' and indexname = $1`,
  constraint: `select 1 from pg_constraint c join pg_namespace n
               on n.oid = c.connamespace
               where n.nspname = 'public' and c.conname = $1`,
};

async function isPresent(
  client: pg.ClientBase,
  object: MigrationObject,
): Promise<boolean> {
  const params =
    object.kind === 'column' ? [object.name, object.table] : [object.name];
  return (await client.query(presenceQuery[object.kind], params)).rowCount! > 0;
}

function label(object: MigrationObject): string {
  return object.kind === 'column'
    ? `column ${object.table}.${object.name}`
    : `${object.kind} ${object.name}`;
}

export async function recordedMigrationCount(
  client: pg.ClientBase,
): Promise<number> {
  const exists = await client.query(
    `select 1 from information_schema.tables
     where table_schema = 'drizzle' and table_name = '__drizzle_migrations'`,
  );
  if (!exists.rowCount) return 0;
  const { rows } = await client.query<{ count: string }>(
    'select count(*)::text as count from drizzle.__drizzle_migrations',
  );
  return Number(rows[0]!.count);
}

export async function inspectExisting(
  client: pg.ClientBase,
  migrationsFolder: string,
  tags: readonly string[],
): Promise<{ presence: Presence[]; report: string[] }> {
  const files = readMigrationFiles({ migrationsFolder });
  const presence: Presence[] = [];
  const report: string[] = [];
  for (const [index, file] of files.entries()) {
    const objects = migrationObjects(file.sql.join('\n'));
    const missing: string[] = [];
    for (const object of objects)
      if (!(await isPresent(client, object))) missing.push(label(object));
    const state: Presence =
      missing.length === 0
        ? 'all'
        : missing.length === objects.length
          ? 'none'
          : 'partial';
    presence.push(state);
    const tag = tags[index] ?? String(index);
    report.push(
      state === 'partial'
        ? `${tag}: partly present (missing ${missing.join(', ')})`
        : `${tag}: ${state === 'all' ? 'present' : 'not present'}`,
    );
  }
  return { presence, report };
}

export async function recordExisting(
  client: pg.ClientBase,
  migrationsFolder: string,
  through: number,
): Promise<void> {
  const files = readMigrationFiles({ migrationsFolder }).slice(0, through + 1);
  await client.query('begin');
  try {
    // The same record drizzle's migrator keeps, so it resumes after these.
    await client.query('create schema if not exists drizzle');
    await client.query(`create table if not exists drizzle.__drizzle_migrations (
      id serial primary key, hash text not null, created_at bigint)`);
    for (const file of files)
      await client.query(
        'insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)',
        [file.hash, file.folderMillis],
      );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
