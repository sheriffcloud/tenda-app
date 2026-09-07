/**
 * Stage 9B (X7) — cross-method verified-email dedup under concurrency. Two
 * first-logins with the SAME verified email via DIFFERENT methods (google sub
 * + email-OTP), fired concurrently, must converge on ONE account — the
 * per-email advisory lock in the orchestrator serialises them. Without the
 * lock this forks into two users.
 *
 * Drives the orchestrator directly (the race is at the DB layer, below the
 * routes). Gated on TEST_DATABASE_URL.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { user_identities, users } from '@tenda/shared/db/schema'
import { resolveOrLink } from '@server/lib/auth/orchestrator'
import { TEST_DB_CONFIGURED, useTestApp, resetDb } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

beforeEach(async () => {
  if (!skip) await resetDb(getApp())
})

test('concurrent first-logins with the same verified email → ONE account', { skip }, async () => {
  const app = getApp()
  const email = 'race@example.com'

  const [r1, r2] = await Promise.all([
    resolveOrLink(app.db, { type: 'identity', identity: { kind: 'google', identifier: 'g-sub-1', email } }, null),
    resolveOrLink(app.db, { type: 'identity', identity: { kind: 'email', identifier: email, email } }, null),
  ])

  // Both resolve to the same user — no fork.
  assert.strictEqual(r1.user.id, r2.user.id, 'both methods must resolve to one account')
  // Exactly one of them created the account.
  assert.strictEqual(Number(r1.isNew) + Number(r2.isNew), 1, 'exactly one create, one dedup-attach')

  // The DB holds both identities, both pointing at the single user.
  const rows = await app.db
    .select({ user_id: user_identities.user_id })
    .from(user_identities)
    .where(eq(user_identities.email, email))
  assert.strictEqual(rows.length, 2, 'google + email identity rows')
  assert.strictEqual(new Set(rows.map((r) => r.user_id)).size, 1, 'one distinct user for the email')
})

test('a repeated login for an already-linked email is idempotent (no new account)', { skip }, async () => {
  const app = getApp()
  const email = 'repeat@example.com'
  const first = await resolveOrLink(app.db, { type: 'identity', identity: { kind: 'email', identifier: email, email } }, null)
  const second = await resolveOrLink(app.db, { type: 'identity', identity: { kind: 'email', identifier: email, email } }, null)
  assert.strictEqual(first.user.id, second.user.id)
  assert.strictEqual(first.isNew, true)
  assert.strictEqual(second.isNew, false)
})

test('concurrent first-logins with the SAME identity → one account, orphan rolled back (#109)', { skip }, async () => {
  // The other half of the race, and the one the orchestrator's orphan-rollback
  // exists for. No email means NO advisory lock (the lock is per-email), so
  // both calls run the create path and the (kind, identifier) UNIQUE decides
  // it: the loser deletes the user row it had just inserted and logs in as the
  // winner instead.
  //
  // The assertions hold on EITHER interleaving — if the two happen to
  // serialise, the second finds the identity and takes the ordinary dedup path
  // to the same answers — which is what keeps this case from being flaky. What
  // it cannot do is report WHICH path ran; see the note at the end of the file
  // for what was measured about that.
  const app = getApp()
  const identifier = '+2348011122233'

  const [r1, r2] = await Promise.all([
    resolveOrLink(app.db, { type: 'identity', identity: { kind: 'phone', identifier, email: null } }, null),
    resolveOrLink(app.db, { type: 'identity', identity: { kind: 'phone', identifier, email: null } }, null),
  ])

  assert.strictEqual(r1.user.id, r2.user.id, 'both logins must land on one account')
  assert.strictEqual(Number(r1.isNew) + Number(r2.isNew), 1, 'exactly one create')

  // NET-ZERO is the property worth pinning: the losing call inserted a user
  // before it lost, so a rollback that failed to fire would leave an orphan
  // account with no identity behind it.
  const identities = await app.db
    .select({ user_id: user_identities.user_id })
    .from(user_identities)
    .where(eq(user_identities.identifier, identifier))
  assert.strictEqual(identities.length, 1, 'one identity row')
  const allUsers = await app.db.select({ id: users.id }).from(users)
  assert.deepStrictEqual(
    allUsers.map((u) => u.id),
    [r1.user.id],
    'exactly one user row exists — no orphan survived the race',
  )
})

test('concurrent LINKS of one identity to one account converge, with no second row (#109)', { skip }, async () => {
  // `insertIdentity`'s other arm: the caller pre-checked that nobody owns this
  // identity, and by the time it inserts, someone does. Reached here by the
  // realistic version — the same user linking the same identity twice at once,
  // which is what a double-tapped button produces — and the loser's recovery is
  // to re-resolve the owner and accept it because the owner is itself.
  //
  // The 409 arm of that recovery (the identity landed on a DIFFERENT account)
  // is the same lines with a different re-resolve result. Sequentially it never
  // gets that far — the pre-check answers first, which is what auth-unified's
  // 'verify link: bearer attaches a new email; a foreign email is blocked'
  // covers.
  const app = getApp()
  const [me] = await app.db.insert(users).values({}).returning()
  const identity = { kind: 'google' as const, identifier: 'g-sub-double-tap', email: null }

  const [r1, r2] = await Promise.all([
    resolveOrLink(app.db, { type: 'identity', identity }, me.id),
    resolveOrLink(app.db, { type: 'identity', identity }, me.id),
  ])

  assert.strictEqual(r1.user.id, me.id)
  assert.strictEqual(r2.user.id, me.id)
  assert.strictEqual(r1.isNew, false)
  assert.strictEqual(r2.isNew, false)

  const rows = await app.db
    .select({ user_id: user_identities.user_id })
    .from(user_identities)
    .where(eq(user_identities.identifier, identity.identifier))
  assert.deepStrictEqual(rows, [{ user_id: me.id }], 'one row, owned by the linker')
})

/**
 * WHAT WAS MEASURED ABOUT THE TWO RACE CASES (#109).
 *
 * Both are `Promise.all` over two real orchestrator calls, so nothing forces
 * the interleave — the concern with such a case is that it quietly stops
 * exercising the recovery path and keeps passing. So it was measured rather
 * than assumed: with c8 over `lib/auth/orchestrator.ts`, THREE consecutive runs
 * of this file each reported the same uncovered set, and in each one the
 * recovery paths were covered — `insertIdentity`'s lost-race arm (173-179) and
 * `createUserAndIdentity`'s orphan rollback (229-241). The full-suite lcov
 * before these cases had both as zero.
 *
 * The assertions were still written to hold on EITHER interleaving. A test that
 * fails when two requests happen to serialise is worse than one that covers a
 * little less, and the outcome — one account, one identity row, no orphan — is
 * the invariant either way.
 *
 * STILL UNCOVERED here and recorded in auth-refusals.test.ts: 214-215, 238-239
 * and 246-247, the three 500s guarding states the database cannot produce.
 */
