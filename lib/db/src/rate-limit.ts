import { sql } from 'drizzle-orm';
import { db } from './index';

export async function consumeRateLimit(
  bucketHash: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(bucketHash))
    throw new Error('Rate-limit bucket hash is invalid');
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new Error('Rate-limit maximum is invalid');
  if (!Number.isSafeInteger(windowMs) || windowMs < 1)
    throw new Error('Rate-limit window is invalid');
  if (!Number.isSafeInteger(now) || now < 0)
    throw new Error('Rate-limit time is invalid');

  const currentTime = new Date(now);
  const resetBefore = new Date(now - windowMs);
  const result = await db.execute(sql`
    insert into api_rate_limits (bucket_hash, window_started_at, hit_count)
    values (${bucketHash}, ${currentTime}, 1)
    on conflict (bucket_hash) do update set
      hit_count = case
        when api_rate_limits.window_started_at <= ${resetBefore} then 1
        else api_rate_limits.hit_count + 1
      end,
      window_started_at = case
        when api_rate_limits.window_started_at <= ${resetBefore} then ${currentTime}
        else api_rate_limits.window_started_at
      end
    returning hit_count
  `);
  return Number(result.rows[0]?.hit_count ?? limit + 1) <= limit;
}

export async function pruneExpiredRateLimits(olderThan: number): Promise<void> {
  if (!Number.isSafeInteger(olderThan) || olderThan < 0)
    throw new Error('Rate-limit expiry time is invalid');
  await db.execute(
    sql`delete from api_rate_limits where window_started_at < ${new Date(olderThan)}`,
  );
}
