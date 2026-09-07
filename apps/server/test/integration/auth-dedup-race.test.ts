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
import { user_identities } from '@tenda/shared/db/schema'
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
