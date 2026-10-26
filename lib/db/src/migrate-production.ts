import path from 'node:path';

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
try {
  await migrate(db, {
    migrationsFolder: path.resolve(import.meta.dirname, '../migrations'),
  });
  console.log('Production migrations are up to date.');
} catch (error) {
  // Report the failure class only; driver messages can echo connection details.
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : 'unknown';
  console.error(`Production migration failed (code ${code}).`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
