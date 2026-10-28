import { describe, expect, it } from 'vitest';
import { describeMigrationFailure } from '../lib/db/src/migration-failure';

// Owner run (28 October 2026): the production migration failed with
// "code unknown" because the driver error was wrapped by the query layer.
describe('describeMigrationFailure', () => {
  it('reports the Postgres code and the committed statement from a wrapped error', () => {
    const wrapped = Object.assign(
      new Error('Failed query: CREATE TABLE "games" (\n "id" uuid)\nparams: '),
      {
        query: 'CREATE TABLE "games" (\n "id" uuid PRIMARY KEY)',
        cause: Object.assign(new Error('relation "games" already exists'), {
          code: '42P07',
        }),
      },
    );
    const text = describeMigrationFailure(wrapped);
    expect(text).toContain('42P07');
    expect(text).toContain('relation "games" already exists');
    expect(text).toContain('CREATE TABLE "games"');
  });

  it('reports a direct driver code', () => {
    const direct = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    expect(describeMigrationFailure(direct)).toContain('ECONNREFUSED');
  });

  it('never prints a connection address or password', () => {
    const leaky = Object.assign(
      new Error('failed for postgresql://owner:do-not-print@db.example:5432/x'),
      {
        cause: Object.assign(
          new Error(
            'password authentication failed for postgres://owner:do-not-print@h/x',
          ),
          { code: '28P01' },
        ),
      },
    );
    const text = describeMigrationFailure(leaky);
    expect(text).toContain('28P01');
    expect(text).not.toContain('do-not-print');
    expect(text).not.toContain('db.example');
  });
});
