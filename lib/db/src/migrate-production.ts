import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describeMigrationFailure } from './migration-failure';

// Explicit, one-off production migration for the owner to run after approval.
// It is never a startup or build hook (no production startup DDL). The
// committed migrations are forward-only and recorded, so re-running is safe.
if (process.env.OATHSTONE_CONFIRM_PRODUCTION_MIGRATION !== 'apply') {
  console.error(
    'Refusing to migrate. Set OATHSTONE_CONFIRM_PRODUCTION_MIGRATION=apply to apply the committed migrations to the database in DATABASE_URL.',
  );
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be set to the production database.');
  process.exit(1);
}

// Imported only after the guards so nothing connects without confirmation.
const { migrate } = await import('drizzle-orm/node-postgres/migrator');
const { db, pool } = await import('./index');
const {
  inspectExisting,
  planBaseline,
  recordExisting,
  recordedMigrationCount,
} = await import('./migration-baseline');
const migrationsFolder = path.resolve(import.meta.dirname, '../migrations');
const tags = (
  JSON.parse(
    readFileSync(path.join(migrationsFolder, 'meta/_journal.json'), 'utf8'),
  ) as { entries: { tag: string }[] }
).entries.map((entry) => entry.tag);

// Tables created outside these migrations (for example by a schema push)
// have no record, so 0000 would fail with 42P07. Record them only when each
// earlier migration is fully present, and only when the owner asks.
async function recordExistingWhenSafe(): Promise<boolean> {
  const client = await pool.connect();
  try {
    if ((await recordedMigrationCount(client)) > 0) return true;
    const { presence, report } = await inspectExisting(
      client,
      migrationsFolder,
      tags,
    );
    const plan = planBaseline(presence);
    if (plan.ok && plan.through === -1) return true;
    console.error('The database has tables but no migration record:');
    for (const line of report) console.error(`  ${line}`);
    if (!plan.ok) {
      console.error(
        `Not recording anything: ${plan.reason}. Nothing was changed.`,
      );
      return false;
    }
    const through = tags[plan.through];
    if (process.env.OATHSTONE_RECORD_EXISTING_MIGRATIONS !== 'yes') {
      console.error(
        `Migrations up to ${through} are fully present. Nothing was changed. To record them as applied and run the rest, re-run with OATHSTONE_RECORD_EXISTING_MIGRATIONS=yes.`,
      );
      return false;
    }
    await recordExisting(client, migrationsFolder, plan.through);
    console.log(`Recorded migrations up to ${through} as already applied.`);
    return true;
  } finally {
    client.release();
  }
}

try {
  if (await recordExistingWhenSafe()) {
    await migrate(db, { migrationsFolder });
    console.log('Production migrations are up to date.');
  } else process.exitCode = 1;
} catch (error) {
  console.error(describeMigrationFailure(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}
