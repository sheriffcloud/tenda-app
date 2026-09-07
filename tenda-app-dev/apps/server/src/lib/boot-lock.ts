/**
 * The one lock every registry writer takes.
 *
 * Three processes can write the chain/asset registry: `migrateOnBoot`,
 * `seedOnBoot`, and a hand-run `pnpm db:seed`. They must serialise, because the
 * seed's guard reads the enabled set and `applySeedRows` re-reads it a moment
 * later — a concurrent writer between those two reads can enable a row the
 * guard never counted, which is then disabled without ever being checked. The
 * CLI was the only reachable way that could happen, since nothing else in the
 * app writes `chains.is_enabled`.
 *
 * Sharing ONE key rather than a key per caller is deliberate: a separate key
 * would let one replica seed while another is mid-migration, writing rows into
 * tables the migration is still altering.
 */

import type postgres from 'postgres'

// Fixed app-wide advisory lock key (0x74656e6461, 'tenda' in hex). Concurrent
// writers serialize here: the first proceeds, the rest wait, then find their
// work already done and no-op. A string (cast to bigint in SQL) because
// postgres.js's types reject bigint params.
export const BOOT_LOCK_KEY = '499917939809'

/**
 * How long to wait for the boot lock before giving up.
 *
 * `pg_advisory_lock` waits FOREVER by default, so a replica stuck mid-migration
 * would hang every other replica's boot with no signal — a container that never
 * reports ready and never reports why. `lock_timeout` does apply to it
 * (verified: "canceling statement due to lock timeout"), so a bounded wait is
 * one statement.
 *
 * Generous, because a legitimate first migration on a large table can take
 * minutes and timing that out would be worse than waiting. Failing hands
 * control back to the orchestrator, which restarts and retries — a loud retry
 * beats a silent hang.
 *
 * A crashed holder is NOT the case this protects against: advisory locks are
 * session-scoped and postgres releases them when the connection dies (verified
 * with kill -9). This is for a live-but-wedged holder.
 */
export const BOOT_LOCK_TIMEOUT = '5min'

/**
 * Bound the wait, then take the lock. Released when the session ends, so every
 * caller owns a dedicated connection and closes it in a `finally`.
 *
 * `timeout` is injectable ONLY so the bound itself is testable — a test cannot
 * wait five minutes to prove the wait is bounded, and without a test a silent
 * deletion of the `set_config` line would restore the unbounded hang unnoticed.
 * Production callers must use the default.
 */
export async function acquireBootLock(
  sql: postgres.Sql,
  timeout: string = BOOT_LOCK_TIMEOUT,
): Promise<void> {
  // `set_config`, not `SET`: postgres.js turns `${}` into a bind parameter and
  // SET takes no parameters, so `set lock_timeout = $1` is a syntax error.
  await sql`select set_config('lock_timeout', ${timeout}, false)`
  await sql`select pg_advisory_lock(${BOOT_LOCK_KEY}::bigint)`
}
