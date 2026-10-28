// Describes a failed migration without connection details. The query layer
// wraps the driver error, so the Postgres code and message sit on `cause`.
// Connection strings are removed in case a driver message echoes one.
const connectionString = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;

function clean(text: string): string {
  return text.replace(connectionString, '[address removed]').slice(0, 300);
}

function field(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object' || !(key in value)) return undefined;
  const found = (value as Record<string, unknown>)[key];
  return found === undefined || found === null ? undefined : String(found);
}

export function describeMigrationFailure(error: unknown): string {
  const cause = field(error, 'cause')
    ? (error as { cause: unknown }).cause
    : error;
  const code = field(cause, 'code') ?? field(error, 'code') ?? 'unknown';
  const message = field(cause, 'message') ?? field(error, 'message') ?? '';
  const query = field(error, 'query');
  return [
    `Production migration failed (code ${code}).`,
    message && `Reason: ${clean(message)}`,
    query && `Statement: ${clean(query.split('\n')[0] ?? '')}`,
  ]
    .filter(Boolean)
    .join('\n');
}
