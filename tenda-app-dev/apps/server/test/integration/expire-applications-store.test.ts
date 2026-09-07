/**
 * The expiry sweep against a REAL database — the pure handler test uses a fake
 * store, so nothing there exercises the actual query. Mirrors the reasoning
 * behind expire-escrows-store: the SQL is where the bugs live.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { gig_applications } from '@tenda/shared/db/schema'
import { drizzleApplicationStore } from '@server/features/applications/store'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

test('expireDue: sweeps only OPEN rows that are actually past due', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const a = await createUser(app)
  const b = await createUser(app)
  const c = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: poster.row.id,
    status: 'open',
    requires_approval: true,
    escrow_ref: 'ref-sweep',
  })
  const now = new Date()
  const past = new Date(now.getTime() - 60_000)
  const future = new Date(now.getTime() + 60_000)

  const [due] = await app.db
    .insert(gig_applications)
    .values({ escrow_id: escrow.id, applicant_id: a.row.id, status: 'open', expires_at: past })
    .returning()
  const [live] = await app.db
    .insert(gig_applications)
    .values({ escrow_id: escrow.id, applicant_id: b.row.id, status: 'open', expires_at: future })
    .returning()
  // Already settled AND past due: must not be re-swept, or a withdrawal would
  // silently become an expiry.
  const [settled] = await app.db
    .insert(gig_applications)
    .values({ escrow_id: escrow.id, applicant_id: c.row.id, status: 'withdrawn', expires_at: past })
    .returning()

  const swept = await drizzleApplicationStore(app.db).expireDue(now, 100)
  assert.strictEqual(swept, 1)

  const statuses = async (id: string) => {
    const [row] = await app.db
      .select({ status: gig_applications.status })
      .from(gig_applications)
      .where(eq(gig_applications.id, id))
    return row.status
  }
  assert.strictEqual(await statuses(due.id), 'expired')
  assert.strictEqual(await statuses(live.id), 'open')
  assert.strictEqual(await statuses(settled.id), 'withdrawn')
})

test('expireDue: honours the batch limit and is safely repeatable', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: poster.row.id,
    status: 'open',
    requires_approval: true,
    escrow_ref: 'ref-batch',
  })
  const now = new Date()
  const past = new Date(now.getTime() - 60_000)
  for (let i = 0; i < 3; i++) {
    const u = await createUser(app)
    await app.db
      .insert(gig_applications)
      .values({ escrow_id: escrow.id, applicant_id: u.row.id, status: 'open', expires_at: past })
  }

  const store = drizzleApplicationStore(app.db)
  assert.strictEqual(await store.expireDue(now, 2), 2, 'bounded per tick')
  assert.strictEqual(await store.expireDue(now, 2), 1, 'the backlog drains next tick')
  assert.strictEqual(await store.expireDue(now, 2), 0, 'and then there is nothing left')
})
