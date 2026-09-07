/**
 * chains/cursors `drizzleCursorStore` against a REAL database.
 *
 * The store had no DB-backed test at all, so every claim the two-cursor tick
 * rests on was verified only against an in-memory fake: that a NULL
 * `backfill_block` reads back as `null` rather than 0, that `initCursors`
 * writes BOTH columns in one statement, and — the one that keeps history from
 * being lost on every tick — that advancing one cursor does not clobber the
 * other. A fake answers those the way it was written to; only Postgres answers
 * them the way production will.
 *
 * DB-backed, gated on TEST_DATABASE_URL. `useTestApp` truncates and re-seeds
 * per test, so each case starts with no cursor row for the chain.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { chain_cursors } from '@tenda/shared/db/schema/ops'
import { TEST_CHAIN_ID, TEST_DB_CONFIGURED, useTestApp } from '../helpers/test-app'
import { drizzleCursorStore } from '@server/chains/cursors'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** The raw row, so an assertion can tell a stored 0 from a stored NULL. */
async function row(): Promise<{ last_block: number; backfill_block: number | null } | undefined> {
  const rows = await getApp()
    .db.select({
      last_block: chain_cursors.last_block,
      backfill_block: chain_cursors.backfill_block,
    })
    .from(chain_cursors)
    .where(eq(chain_cursors.chain_id, TEST_CHAIN_ID))
  return rows[0]
}

test('a chain with no cursor row reads 0 live and NULL history', { skip }, async () => {
  const store = drizzleCursorStore(getApp().db)

  assert.equal(await store.getCursor(TEST_CHAIN_ID), 0)
  assert.equal(
    await store.getBackfillCursor(TEST_CHAIN_ID),
    null,
    'a missing row is UNINITIALISED history, not history complete at block 0',
  )
})

test('initCursors writes both positions in one statement, insert and update alike', { skip }, async () => {
  const store = drizzleCursorStore(getApp().db)

  // Insert branch: no row yet.
  await store.initCursors(TEST_CHAIN_ID, { live: 500_000, backfill: 100_000 })
  assert.deepEqual(await row(), { last_block: 500_000, backfill_block: 100_000 })

  // Update branch: the row exists. Both columns must move together — a
  // conflict clause that set only one is how adoption lost 400,000 blocks.
  await store.initCursors(TEST_CHAIN_ID, { live: 600_000, backfill: 200_000 })
  assert.deepEqual(await row(), { last_block: 600_000, backfill_block: 200_000 })
})

test('a history cursor of 0 persists as 0, never as NULL', { skip }, async () => {
  // The whole reason the column is nullable. A chain whose history starts at
  // block 1 adopts `1 - 1`; if that round-tripped as NULL the next tick would
  // re-adopt and skip the history it had not scanned yet.
  const store = drizzleCursorStore(getApp().db)

  await store.initCursors(TEST_CHAIN_ID, { live: 100, backfill: 0 })

  assert.equal((await row())?.backfill_block, 0)
  assert.equal(await store.getBackfillCursor(TEST_CHAIN_ID), 0, 'read back as 0, not null')
})

test('advancing one cursor leaves the other exactly where it was', { skip }, async () => {
  // Every tick calls setCursor, and most also call setBackfillCursor. If either
  // upsert overwrote the column it does not own, the two-cursor scan would
  // reset itself once per tick.
  const store = drizzleCursorStore(getApp().db)
  await store.initCursors(TEST_CHAIN_ID, { live: 1_000, backfill: 400 })

  await store.setCursor(TEST_CHAIN_ID, 1_200)
  assert.deepEqual(await row(), { last_block: 1_200, backfill_block: 400 }, 'history untouched')

  await store.setBackfillCursor(TEST_CHAIN_ID, 600)
  assert.deepEqual(await row(), { last_block: 1_200, backfill_block: 600 }, 'live untouched')

  // Read back through the STORE, not just the raw row: every tick begins by
  // asking it where both cursors are, so a reader that answered the default
  // instead of the stored value would restart the scan on each tick.
  assert.equal(await store.getCursor(TEST_CHAIN_ID), 1_200)
  assert.equal(await store.getBackfillCursor(TEST_CHAIN_ID), 600)
})

test('setCursor on a chain with no row leaves history uninitialised', { skip }, async () => {
  // The negative of the above: a live write must not invent a history position,
  // or a fresh chain would never run adoption at all.
  const store = drizzleCursorStore(getApp().db)

  await store.setCursor(TEST_CHAIN_ID, 42)

  assert.deepEqual(await row(), { last_block: 42, backfill_block: null })
  assert.equal(await store.getBackfillCursor(TEST_CHAIN_ID), null)
})
