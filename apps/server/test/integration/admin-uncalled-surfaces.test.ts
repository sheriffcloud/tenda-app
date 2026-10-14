/**
 * The admin reads the DASHBOARD does not call (#125).
 *
 * #121 moved `adminRoutes` into `@tenda/shared/api/admin` so the drift suite
 * could check the dashboard's map against the live route table. Comparing the
 * two lists exactly left three paths the server serves and the map does not
 * declare:
 *
 *   /v1/admin/escrows/:id           the raw triage row, INCLUDING drafts
 *   /v1/admin/fiat/intents/:id      one intent, whole
 *   /v1/admin/finance/transactions  the escrow-transaction ledger
 *
 * ALL THREE ARE KEPT, and each answers a question its called sibling cannot.
 * `/dossier` assembles mediation context over seven queries; the plain row is
 * the LIST's row for one id, in one. `/fiat/intents` lists; nothing reads ONE
 * intent, which is what an operator wants when a single payment is stuck.
 * `/finance/fees` aggregates; the ledger is the rows behind the total. Each
 * route now says so in its own header, the way #120 settled its own pair.
 *
 * NOT "because the dossier cannot reach drafts" — that justification was
 * written first, checked second, and was wrong: dossier.ts filters on id
 * alone, and the admin list does not exclude drafts either.
 *
 * THE CLAIM THAT THEY WERE "TESTED" WAS INHERITED AND WRONG, which is why this
 * file exists. It came from the #105/#110 sweeps and #121 repeated it without
 * re-checking; #125 checked. Measured before writing anything:
 *
 *   finance/transactions   refusals AND a success control — genuinely covered
 *   admin/escrows/:id      ONE case, a malformed id -> 404. No success path.
 *   fiat/intents/:id       ONE case, a malformed id -> 404. No success path.
 *
 * So for two of the three, every line that reads a row and shapes a reply was
 * executed by nothing. A malformed-id test is answered by a preHandler; it
 * never reaches the handler at all, which is exactly why it looked like
 * coverage and was not.
 *
 * WHAT EACH CASE HERE PINS is the pair a read surface can get wrong without
 * erroring: the row it returns is the row that was ASKED FOR, and an id that
 * exists-but-is-not-this-one is refused rather than answered. A handler that
 * dropped its `where` would pass any test that only checks for a 200.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { escrows } from '@tenda/shared/db/schema'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createAdmin,
  createUser,
  authHeader,
} from '../helpers/test-app'
import { partiedEscrow } from '../helpers/escrow-states'
import { seedFiatIntent } from '../helpers/fiat-intents'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** Well-formed, and belonging to nothing — past the uuid guard, into the handler. */
const ABSENT_ID = '00000000-0000-4000-8000-00000000dead'

test('admin escrow detail: returns the escrow ASKED FOR, not just an escrow', { skip }, async () => {
  // TWO escrows, because one proves nothing. A handler that lost its `where`
  // returns a row either way and answers 200 either way — the only thing that
  // separates correct from broken is asking for each and getting a different
  // answer.
  const app = getApp()
  const admin = await createAdmin(app)
  const first = await partiedEscrow(app, 'accepted')
  const second = await partiedEscrow(app, 'submitted')
  assert.notStrictEqual(first.escrow.id, second.escrow.id, 'the fixtures must differ')

  for (const escrow_id of [first.escrow.id, second.escrow.id]) {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/escrows/${escrow_id}`,
      headers: authHeader(admin.token),
    })
    assert.strictEqual(res.statusCode, 200, res.body)
    assert.strictEqual(res.json().id, escrow_id, 'the row returned is the row requested')
  }
})

test('admin escrow detail: reaches a DRAFT, which is the point of it', { skip }, async () => {
  // The route's header has called this the triage row "incl. drafts" since
  // long before #125, and nothing was checking that. A draft is invisible to
  // every PUBLIC read, so if a status filter were ever added here the header
  // would quietly become false.
  //
  // This is NOT why the route survives alongside /dossier — the dossier reads
  // drafts too. It guards the route's own documented claim, which is a smaller
  // thing and still worth a case.
  const app = getApp()
  const admin = await createAdmin(app)
  const { escrow } = await partiedEscrow(app, 'accepted')
  await app.db.update(escrows).set({ status: 'draft' }).where(eq(escrows.id, escrow.id))

  const res = await app.inject({
    method: 'GET',
    url: `/v1/admin/escrows/${escrow.id}`,
    headers: authHeader(admin.token),
  })
  assert.strictEqual(res.statusCode, 200, res.body)
  assert.strictEqual(res.json().status, 'draft')
})

test('admin escrow detail: a well-formed id that is nobody is 404', { skip }, async () => {
  // NOT the malformed-id case in malformed-id.test.ts. That one is answered by
  // a preHandler and never reaches the handler; this reaches the handler's own
  // `row === undefined` guard, which had nothing executing it.
  //
  // AN ESCROW IS SEEDED FIRST, and that is load-bearing. Without it the table
  // is empty, so a handler that had LOST its `where` would also answer 404 and
  // this case would pass while guarding nothing — measured, not guessed: it
  // did exactly that against the where-less mutant until this line was added.
  // With a row present, only a correct `where` can still answer 404.
  const app = getApp()
  const admin = await createAdmin(app)
  await partiedEscrow(app, 'accepted')

  const res = await app.inject({
    method: 'GET',
    url: `/v1/admin/escrows/${ABSENT_ID}`,
    headers: authHeader(admin.token),
  })
  assert.strictEqual(res.statusCode, 404, res.body)
  assert.match(res.json().message, /Escrow not found/)
})

test('admin intent detail: returns the intent ASKED FOR, not just an intent', { skip }, async () => {
  // Same shape as the escrow case above and for the same reason — two rows, so
  // a lost `where` cannot pass.
  const app = getApp()
  const admin = await createAdmin(app)
  const owner = await createUser(app)
  const first = await seedFiatIntent(app, owner.row.id, 'awaiting_user')
  const second = await seedFiatIntent(app, owner.row.id, 'settled')
  assert.notStrictEqual(first, second, 'the fixtures must differ')

  for (const [id, status] of [[first, 'awaiting_user'], [second, 'settled']] as const) {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/fiat/intents/${id}`,
      headers: authHeader(admin.token),
    })
    assert.strictEqual(res.statusCode, 200, res.body)
    const { intent } = res.json() as { intent: { id: string; status: string } }
    assert.strictEqual(intent.id, id, 'the row returned is the row requested')
    // The status is what an operator opened this for, and it is the field the
    // list and the overrides both branch on.
    assert.strictEqual(intent.status, status)
  }
})

test('admin intent detail: a well-formed id that is nobody is 404', { skip }, async () => {
  // An intent is seeded for the same reason as the escrow case above: against
  // an empty table a broken lookup answers 404 too, so the refusal has to be
  // shown to survive a table that HAS rows in it.
  const app = getApp()
  const admin = await createAdmin(app)
  const owner = await createUser(app)
  await seedFiatIntent(app, owner.row.id, 'awaiting_user')

  const res = await app.inject({
    method: 'GET',
    url: `/v1/admin/fiat/intents/${ABSENT_ID}`,
    headers: authHeader(admin.token),
  })
  assert.strictEqual(res.statusCode, 404, res.body)
  assert.match(res.json().message, /intent not found/)
})
