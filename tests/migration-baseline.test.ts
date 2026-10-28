import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  migrationObjects,
  planBaseline,
} from '../lib/db/src/migration-baseline';

// Owner run (28 October 2026): production already had the tables (created
// outside the migration files), so the first migration failed with 42P07.
describe('migrationObjects', () => {
  it('lists the tables, columns, indexes and constraints a migration creates', () => {
    const objects = migrationObjects(
      readFileSync('lib/db/migrations/0014_game_end_date.sql', 'utf8'),
    );
    expect(objects).toContainEqual({
      kind: 'column',
      table: 'games',
      name: 'game_end_date',
    });
    expect(objects).toContainEqual({ kind: 'table', name: 'game_tombstones' });
    expect(objects).toContainEqual({
      kind: 'index',
      name: 'games_end_date_idx',
    });
    expect(objects).toContainEqual({
      kind: 'constraint',
      name: 'games_end_date_required_check',
    });
  });

  it('keeps the definition of a foreign key so an equivalent one can match', () => {
    const objects = migrationObjects(
      readFileSync('lib/db/migrations/0013_game_seat_connections.sql', 'utf8'),
    );
    expect(objects).toContainEqual({
      kind: 'constraint',
      name: 'game_seat_connections_game_id_games_id_fk',
      table: 'game_seat_connections',
      definition: 'foreignkey(game_id)referencesgames(id)ondeletecascade',
    });
  });

  it('finds something to check in every committed migration', () => {
    const journal = JSON.parse(
      readFileSync('lib/db/migrations/meta/_journal.json', 'utf8'),
    ) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries)
      expect(
        migrationObjects(readFileSync(`lib/db/migrations/${tag}.sql`, 'utf8')),
        tag,
      ).not.toHaveLength(0);
  });
});

describe('planBaseline', () => {
  it('records a complete prefix and leaves the rest to migrate', () => {
    expect(planBaseline(['all', 'all', 'none', 'none'])).toEqual({
      ok: true,
      through: 1,
    });
  });

  it('needs no baseline for an empty database', () => {
    expect(planBaseline(['none', 'none'])).toEqual({ ok: true, through: -1 });
  });

  it('refuses a partly applied migration', () => {
    const plan = planBaseline(['all', 'partial', 'none']);
    expect(plan.ok).toBe(false);
  });

  it('refuses a gap, where a later migration is present but an earlier one is not', () => {
    expect(planBaseline(['all', 'none', 'all']).ok).toBe(false);
  });
});
