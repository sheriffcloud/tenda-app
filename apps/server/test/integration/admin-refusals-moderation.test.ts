/**
 * Admin MODERATION-OVERRIDE refusals that no test executed (#105 T5d).
 *
 * routes/v1/admin/moderation.ts was 44 of 86 lines unexecuted: the verdict audit
 * log and the override that reverses a block had both never run.
 *
 * WHAT AN OVERRIDE ACTUALLY DOES, and why the control asserts three things
 * rather than a status. It never mutates the original verdict — it APPENDS a new
 * `approve` verdict carrying the same input_hash, marked provider='admin', and
 * then bumps `platform_config.moderation_rules_version` so cached block verdicts
 * die lazily instead of being deleted en masse. Each of those is separately
 * droppable: an override that appended nothing, or one that forgot the version
 * bump, would still answer 200 and leave the author blocked by cache.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { moderation_verdicts } from '@tenda/shared/db/schema/moderation'
import { platform_config } from '@tenda/shared/db/schema/governance'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createAdmin,
  authHeader,
  setPlatformConfig,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const VERDICTS = '/v1/admin/moderation/verdicts'
const ABSENT = '00000000-0000-0000-0000-000000000000'

/** A block verdict to reverse — the state an override exists for. */
async function seedBlock(app: ReturnType<typeof getApp>): Promise<{ id: string; hash: string }> {
  const id = randomUUID()
  const hash = `hash-${randomUUID()}`
  await app.db.insert(moderation_verdicts).values({
    id,
    subject_kind: 'gig_draft',
    subject_id: randomUUID(),
    input_hash: hash,
    decision: 'block',
    reasons: [{ code: 'PROHIBITED', message: 'weapons', severity: 'high' }],
    provider: 'keyword',
  })
  return { id, hash }
}

/**
 * The rules epoch, which the override bumps.
 *
 * The harness does NOT seed a platform_config row, and the route's bump is an
 * UPDATE ... WHERE id = 1 — so with no row it updates nothing and the assertion
 * would be measuring the missing fixture rather than the handler. MEASURED: the
 * first version of this test failed on exactly that. The control therefore
 * establishes the row first, which is also the production state (it is seeded).
 */
async function rulesVersion(app: ReturnType<typeof getApp>): Promise<number> {
  const [row] = await app.db.select().from(platform_config).where(eq(platform_config.id, 1))
  assert.ok(row, 'platform_config row 1 must exist for the rules epoch to move')
  return row.moderation_rules_version
}

test('moderation verdicts: the audit log lists, and filters by decision', { skip }, async () => {
  // The list had never been called. The decision filter is the branch worth
  // pinning: an unrecognised value falls through to NO filter rather than
  // refusing, so this asserts the accepted values narrow and the rest do not
  // silently narrow to nothing.
  const app = getApp()
  const a = await createAdmin(app)
  const { id } = await seedBlock(app)

  const all = await app.inject({ method: 'GET', url: VERDICTS, headers: authHeader(a.token) })
  assert.strictEqual(all.statusCode, 200, all.body)
  assert.strictEqual(all.json().page, 0)
  assert.ok(all.json().verdicts.some((v: { id: string }) => v.id === id))

  const blocked = await app.inject({
    method: 'GET', url: `${VERDICTS}?decision=block`, headers: authHeader(a.token),
  })
  assert.strictEqual(blocked.statusCode, 200, blocked.body)
  assert.ok(blocked.json().verdicts.every((v: { decision: string }) => v.decision === 'block'))

  // 'approve' must NOT contain the block above — otherwise the filter is inert.
  const approved = await app.inject({
    method: 'GET', url: `${VERDICTS}?decision=approve`, headers: authHeader(a.token),
  })
  assert.strictEqual(approved.statusCode, 200, approved.body)
  assert.ok(!approved.json().verdicts.some((v: { id: string }) => v.id === id))
})

test('moderation override: a reason is required', { skip }, async () => {
  const app = getApp()
  const a = await createAdmin(app)
  const { id } = await seedBlock(app)

  for (const reason of [undefined, '', 42, null]) {
    const res = await app.inject({
      method: 'POST', url: `${VERDICTS}/${id}/override`, headers: authHeader(a.token), payload: { reason },
    })
    assert.strictEqual(res.statusCode, 422, String(reason))
    assert.match(res.json().message, /^reason is required$/)
  }
})

test('moderation override: an absent verdict is 404', { skip }, async () => {
  // Checked AFTER the reason, so this case sends a valid one — otherwise it
  // would be measuring the guard above.
  const app = getApp()
  const a = await createAdmin(app)

  const res = await app.inject({
    method: 'POST', url: `${VERDICTS}/${ABSENT}/override`,
    headers: authHeader(a.token), payload: { reason: 'appealed successfully' },
  })
  assert.strictEqual(res.statusCode, 404)
  assert.match(res.json().message, /^verdict not found$/)
})

test('moderation override: appends an approve verdict AND bumps the rules version', { skip }, async () => {
  // The control, and it asserts every separable effect. The original must
  // survive (it is an audit log), the new row must carry the SAME input_hash
  // (that is what makes the cached block unreachable for the same input), and
  // the rules version must move (that is what expires the cache at all).
  const app = getApp()
  const a = await createAdmin(app)
  const { id, hash } = await seedBlock(app)
  // A real patch, not `{}` — the helper's upsert needs at least one value, and
  // pinning the epoch makes the +1 below exact rather than relative to whatever
  // an earlier suite left behind.
  await setPlatformConfig(app, { moderation_rules_version: 1 })
  const versionBefore = await rulesVersion(app)
  assert.strictEqual(versionBefore, 1)

  const res = await app.inject({
    method: 'POST', url: `${VERDICTS}/${id}/override`,
    headers: authHeader(a.token), payload: { reason: 'false positive on a tool listing' },
  })
  assert.strictEqual(res.statusCode, 200, res.body)

  const rows = await app.db
    .select()
    .from(moderation_verdicts)
    .where(eq(moderation_verdicts.input_hash, hash))
  assert.strictEqual(rows.length, 2, 'the override APPENDS rather than mutating')

  const original = rows.find((r) => r.id === id)
  assert.strictEqual(original?.decision, 'block', 'the original verdict is untouched')

  const appended = rows.find((r) => r.id !== id)
  assert.strictEqual(appended?.decision, 'approve')
  assert.strictEqual(appended?.provider, 'admin')
  assert.strictEqual(appended?.subject_id, original?.subject_id, 'same subject')

  assert.strictEqual(
    await rulesVersion(app),
    versionBefore + 1,
    'the rules epoch moves so cached block verdicts die lazily',
  )
})

/**
 * NOT COVERED, recorded rather than forced:
 *
 *   admin/disputes.ts:284  the `catch` arm of the propose-resolution insert.
 *   Its 409 is IDENTICAL in status, code and message to the pre-check at line
 *   272, which is already covered — so a test asserting "a second proposal is
 *   409" passes without ever reaching 284, exactly as the duplicate-link case
 *   did in T4.
 *
 *   Line 284 is only reachable when the pre-check passes and the INSERT then
 *   conflicts, i.e. a genuine race. There is no gap to exploit between the two:
 *   MEASURED, `getActiveResolution` filters on ACTIVE_RESOLUTION_STATUSES =
 *   ['pending', 'executing'] and the partial unique index
 *   `dispute_resolutions_active_uq` is defined `where status IN ('pending',
 *   'executing')` — the same predicate, so any row the index would reject is a
 *   row the pre-check already found. Reaching 284 therefore needs two concurrent
 *   proposals interleaved between the SELECT and the INSERT, which a test can
 *   make likely and not certain. A flaky race case would be worse than this
 *   note; the guard is the correct backstop and the comment above it says so.
 */
