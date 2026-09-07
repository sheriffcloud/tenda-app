/**
 * lib/boot-lock.ts — the single advisory lock every registry writer takes.
 *
 * Three writers exist: migrateOnBoot, seedOnBoot, and the hand-run `db:seed`
 * CLI. They must serialise, because seedOnBoot's guard reads the enabled set
 * and applySeedRows re-reads it a moment later; a writer committing between
 * those two reads can enable a row the guard never counted, which is then
 * disabled without ever being checked for live escrows.
 *
 * Two things are proven here, and the second one was untestable until the
 * timeout became injectable:
 *   1. the lock is mutually exclusive
 *   2. the wait is BOUNDED — deleting the set_config line restores an
 *      unbounded hang, which is a container that never reports ready and never
 *      says why
 */
import { test } from 'node:test'
import assert from 'node:assert'
import postgres from 'postgres'
import { TEST_DB_CONFIGURED, useSuiteLock } from '../helpers/test-app'
import { acquireBootLock, BOOT_LOCK_TIMEOUT } from '@server/lib/boot-lock'
import { runSeed } from '@server/db/seed-v2'

const skip = !TEST_DB_CONFIGURED

// Takes the same cross-process lock as the other registry suites: this file
// runs the real CLI seed against the shared registry.
useSuiteLock()

/**
 * Did the call acquire the lock, give up waiting, or never come back?
 *
 * The `hung` outcome exists so this test cannot be wedged by the very bug it
 * checks for: with `set_config` deleted the wait is unbounded, and a plain
 * await would hang the whole suite until the CI runner killed it instead of
 * failing in seconds. (Observed — an earlier version of this file did exactly
 * that under mutation.)
 */
async function tryAcquire(
  sql: postgres.Sql,
  timeout: string,
): Promise<'held' | 'timed-out' | 'hung'> {
  const attempt = (async (): Promise<'held' | 'timed-out'> => {
    try {
      await acquireBootLock(sql, timeout)
      return 'held'
    } catch (e) {
      if (e instanceof Error && 'code' in e && e.code === '55P03') return 'timed-out'
      throw e // anything else is a broken test, not a contended lock
    }
  })()
  const ceiling = new Promise<'hung'>((r) => setTimeout(() => r('hung'), 5000).unref())
  return Promise.race([attempt, ceiling])
}

test('the boot lock is mutually exclusive, and the wait is bounded', { skip }, async () => {
  const url = process.env.TEST_DATABASE_URL!
  const holder = postgres(url, { max: 1 })
  const waiter = postgres(url, { max: 1 })
  try {
    // Control: uncontended, it is acquired immediately. Without this a lock
    // that never works at all would look identical to a lock that blocks.
    assert.strictEqual(await tryAcquire(holder, '2s'), 'held', 'uncontended acquire must succeed')

    // Contended: the second caller must NOT get it, and must give up rather
    // than hang. Both halves matter — `timed-out` proves the mutual exclusion
    // AND that lock_timeout is actually applied to pg_advisory_lock.
    const outcome = await tryAcquire(waiter, '300ms')
    assert.strictEqual(
      outcome,
      'timed-out',
      outcome === 'hung'
        ? 'the wait is UNBOUNDED — lock_timeout is not being applied to pg_advisory_lock'
        : 'the lock is not mutually exclusive',
    )
  } finally {
    // timeout: 0 destroys immediately; a graceful end() would itself wait on a
    // still-pending acquire if the assertion above failed.
    await Promise.all([holder.end({ timeout: 0 }), waiter.end({ timeout: 0 })])
  }
})

test('the lock is released when the holder disconnects', { skip }, async () => {
  // Advisory locks are session-scoped, which is why every caller can own a
  // dedicated connection and simply close it in a finally rather than
  // unlocking explicitly. If that stopped being true, a crashed seed would
  // wedge every subsequent boot.
  const url = process.env.TEST_DATABASE_URL!
  const first = postgres(url, { max: 1 })
  await acquireBootLock(first, '2s')
  await first.end()

  const second = postgres(url, { max: 1 })
  try {
    assert.strictEqual(
      await tryAcquire(second, '2s'),
      'held',
      'the lock outlived the session that held it',
    )
  } finally {
    await second.end()
  }
})

test('the production default is a bounded wait, not "forever"', () => {
  // Pins the shape of the default: an empty string or '0' would disable
  // lock_timeout entirely and silently restore the unbounded hang.
  assert.match(BOOT_LOCK_TIMEOUT, /^\d+(ms|s|min)$/)
  assert.notStrictEqual(BOOT_LOCK_TIMEOUT, '0')
})

test('the hand-run CLI seed waits for the boot lock instead of racing', { skip }, async () => {
  // The actual fix. A `pnpm db:seed` run during a deploy used to write the
  // registry concurrently with a booting container; now it queues behind it.
  const url = process.env.TEST_DATABASE_URL!
  const holder = postgres(url, { max: 1 })
  let released = false
  try {
    await acquireBootLock(holder, '2s')

    let finished = false
    const cli = runSeed(url).then(() => {
      finished = true
    })

    // Give it long enough that it would certainly have finished unblocked —
    // an uncontended seed takes ~50ms.
    await new Promise((r) => setTimeout(r, 750))
    assert.strictEqual(finished, false, 'the CLI seed ran straight through a held boot lock')

    released = true
    await holder.end() // releasing lets it proceed
    await cli
    assert.strictEqual(finished, true, 'the CLI seed did not resume after the lock was released')
  } finally {
    if (!released) await holder.end()
  }
})
