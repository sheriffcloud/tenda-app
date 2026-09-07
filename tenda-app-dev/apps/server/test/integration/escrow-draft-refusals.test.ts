/**
 * The refusals that guard a DRAFT escrow between creation and publication
 * (#112 — the four the #105 sweep left unclosed).
 *
 * A draft is the staging row for an escrow whose transaction the creator has
 * not signed yet, or has signed and not yet had confirmed. That window is
 * re-enterable on purpose: a client retries `POST /v1/escrows` with the same
 * `creation_operation_id` and must get the SAME draft back, never a second
 * escrow. These guard the ways that can go wrong.
 *
 * CLOSED HERE:
 *   escrows/index:119  a create transaction is already awaiting confirmation.
 *   escrows/index:197  a concurrent request won the operation key with
 *                      DIFFERENT terms.
 * RECORDED, with the measurement, at the end of this file:
 *   escrows/index:194  the winner of that race cannot be found afterwards.
 *   escrows/_id:77     the draft left `draft` between the SELECT and the DELETE.
 *
 * WHY THE 197 CASE STAGES ITS RACE RATHER THAN RACING TWO REQUESTS. The
 * SEQUENTIAL path refuses reused-with-different-terms at line 137 with the same
 * status, the same code and a byte-identical message, so a 409 out of two
 * concurrent requests cannot say which of the two answered — and a scheduling
 * change would move the case off the guard it is named for while it kept
 * passing. T2 wrote exactly that test, watched it survive the removal of 197,
 * deleted it, and recorded both lines in escrows-create.test.ts as unstageable.
 * That last part is what this file disproves: the hook below puts the competing
 * row in at the one instant the branch exists for, deterministically.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { escrows, tx_attempts } from '@tenda/shared/db/schema'
import {
  FAKE_UNSIGNED,
  TEST_CHAIN_ID,
  TEST_DB_CONFIGURED,
  authHeader,
  createEscrow,
  createTransactableUser,
  useTestApp,
  type TestUser,
} from '../helpers/test-app'
import { createEscrowBody } from '../helpers/escrow-states'

/** What the shared builder produces — the one definition of a valid create body. */
type CreateEscrowRequestBody = ReturnType<typeof createEscrowBody>

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** Terms shared by a request body and the row a competing writer inserts. */
const ACCEPT_WINDOW_SECONDS = 24 * 3600
const COMPLETION_SECONDS = 3_600
const AMOUNT_RAW = '1000000'
/** What the competing writer asks for instead, in the different-terms case. */
const RIVAL_AMOUNT_RAW = '2000000'

function draftBody(operation_id: string): CreateEscrowRequestBody {
  return createEscrowBody({
    creation_operation_id: operation_id,
    amount_raw: AMOUNT_RAW,
    accept_window_seconds: ACCEPT_WINDOW_SECONDS,
    completion_duration_seconds: COMPLETION_SECONDS,
  })
}

function post(
  app: FastifyInstance,
  user: TestUser,
  payload: CreateEscrowRequestBody,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'POST',
    url: '/v1/escrows',
    headers: authHeader(user.token),
    payload,
  })
}

// ---------- escrows/index:119 — a broadcast create is still in flight ----------

test('create replay: an unconfirmed create transaction blocks the replay, 409', { skip }, async () => {
  const app = getApp()
  const user = await createTransactableUser(app)
  const body = draftBody(randomUUID())

  const first = await post(app, user, body)
  assert.strictEqual(first.statusCode, 201, first.body)
  const escrow_id: string = first.json().escrow_id

  // Nothing broadcast yet, so the replay hands back the same draft — without
  // this the 409 below is satisfied by "replays are refused" rather than by
  // "THIS replay is".
  const idle = await post(app, user, body)
  assert.strictEqual(idle.statusCode, 200, idle.body)
  assert.strictEqual(idle.json().escrow_id, escrow_id)

  // The creator signed and broadcast: an attempt exists and has not settled.
  await app.db.insert(tx_attempts).values({
    user_id: user.row.id,
    escrow_id,
    action: 'create',
    tx_ref: `create-${randomUUID()}`,
  })

  const blocked = await post(app, user, body)
  assert.strictEqual(blocked.statusCode, 409, blocked.body)
  assert.strictEqual(blocked.json().code, 'ESCROW_WRONG_STATUS')
  // Pinned exactly — the DELETE route refuses the same state with a message
  // that differs only in its tail ('…before discarding').
  assert.strictEqual(
    blocked.json().message,
    'A create transaction is awaiting confirmation, wait for it to settle',
  )

  // A FAILED attempt does not block: a reverted broadcast has to be retryable,
  // and this is the half of `hasPendingEscrowCreateTransaction` that says so.
  await app.db
    .update(tx_attempts)
    .set({ failed_at: new Date() })
    .where(eq(tx_attempts.escrow_id, escrow_id))

  const retry = await post(app, user, body)
  assert.strictEqual(retry.statusCode, 200, retry.body)
  assert.strictEqual(retry.json().escrow_id, escrow_id)
})

// ---------- escrows/index:197 — a race winner with different terms ------------

/**
 * Run `body` with a competing writer that fires ONCE, inside the create route's
 * only await between its operation lookup and its insert.
 *
 * The hook goes on the harness's FAKE adapter — already this harness's one
 * substitution, and `buildUnsigned` is the whole of the window the reconcile
 * branch exists for. Nothing about that branch is faked: the competing row is a
 * real INSERT, the collision is the real partial unique index on (creator_id,
 * creation_operation_id), and the route answers from its own path. Restoring
 * the original in `finally` is load-bearing — the adapter is shared by every
 * test in this file.
 */
async function withRaceWinner(
  app: FastifyInstance,
  insertWinner: () => Promise<void>,
  body: () => Promise<void>,
): Promise<{ builds: number; stagings: number }> {
  const adapter = app.chains.get(TEST_CHAIN_ID)
  const original = adapter.buildTx
  const counts = { builds: 0, stagings: 0 }
  adapter.buildTx = async (build) => {
    counts.builds += 1
    if (counts.stagings === 0) {
      counts.stagings = 1
      await insertWinner()
    }
    return original(build)
  }
  try {
    await body()
  } finally {
    adapter.buildTx = original
  }
  return counts
}

test('create replay: a race winner with DIFFERENT terms is 409, and leaves one row', { skip }, async () => {
  const app = getApp()
  const user = await createTransactableUser(app)
  const operation_id = randomUUID()

  const counts = await withRaceWinner(
    app,
    async () => {
      await createEscrow(app, {
        creator_id: user.row.id,
        creation_operation_id: operation_id,
        // The ONE difference from the request in flight. Everything else
        // matches, so the refusal is about the terms and not about the row
        // being unrecognisable.
        amount_raw: RIVAL_AMOUNT_RAW,
        // Staged with the SAME window the body sends: #41 made the window one
        // of the compared terms, so a row staged with the fixture default would
        // now be a genuine mismatch rather than a race to converge on.
        accept_window_seconds: ACCEPT_WINDOW_SECONDS,
        completion_duration_seconds: COMPLETION_SECONDS,
      })
    },
    async () => {
      const res = await post(app, user, draftBody(operation_id))
      assert.strictEqual(res.statusCode, 409, res.body)
      assert.strictEqual(res.json().code, 'VALIDATION_ERROR')
      assert.strictEqual(
        res.json().message,
        'creation_operation_id was already used with different escrow terms',
      )
    },
  )

  assert.deepStrictEqual(
    counts,
    { builds: 1, stagings: 1 },
    "the refusal lands before the winner's own transaction is built",
  )

  // The losing request must not have left a draft behind — the whole point of
  // the ON CONFLICT DO NOTHING it just lost.
  const rows = await app.db
    .select({ id: escrows.id, amount_raw: escrows.amount_raw })
    .from(escrows)
    .where(eq(escrows.creation_operation_id, operation_id))
  assert.strictEqual(rows.length, 1, 'one row for the operation id, not two')
  assert.strictEqual(rows[0].amount_raw, RIVAL_AMOUNT_RAW, "the winner's row survived")
})

test('create replay: a race winner with the SAME terms hands back that draft (the control)', { skip }, async () => {
  // The 409 above has to be about the TERMS rather than about losing the race:
  // identical staging, matching terms, and the request converges on the
  // winner's draft instead of minting a second escrow.
  //
  // It is also where the staging hook shows its own shape: this path builds a
  // SECOND unsigned tx (for the row that survived — escrows/index.ts:206), so a
  // hook that inserted per BUILD rather than per race would insert twice.
  const app = getApp()
  const user = await createTransactableUser(app)
  const operation_id = randomUUID()
  let winner_id = ''

  const counts = await withRaceWinner(
    app,
    async () => {
      const row = await createEscrow(app, {
        creator_id: user.row.id,
        creation_operation_id: operation_id,
        amount_raw: AMOUNT_RAW,
        // Staged with the SAME window the body sends: #41 made the window one
        // of the compared terms, so a row staged with the fixture default would
        // now be a genuine mismatch rather than a race to converge on.
        accept_window_seconds: ACCEPT_WINDOW_SECONDS,
        completion_duration_seconds: COMPLETION_SECONDS,
      })
      winner_id = row.id
    },
    async () => {
      const res = await post(app, user, draftBody(operation_id))
      assert.strictEqual(res.statusCode, 200, res.body)
      assert.strictEqual(res.json().escrow_id, winner_id, "the winner's row, not a new one")
      assert.deepStrictEqual(
        res.json().unsigned,
        FAKE_UNSIGNED,
        'the caller still gets something to sign',
      )
    },
  )
  assert.deepStrictEqual(counts, { builds: 2, stagings: 1 })

  // The adapter is handed back, or every later test in this file would be
  // running against a hook this one installed.
  const after = await post(app, user, draftBody(randomUUID()))
  assert.strictEqual(after.statusCode, 201, after.body)
})

/**
 * NOT COVERED, recorded with what was measured rather than asserted:
 *
 *   escrows/index.ts:194  'Could not reconcile escrow creation' — the arm where
 *   the race winner cannot be found after our insert lost to it. The branch
 *   around it is reachable, and is now executed deterministically by the 197
 *   case above (and less deterministically by 'concurrent creation retries
 *   converge on one draft' in create-contract-body.test.ts, which reaches it
 *   with two live requests). This arm is not: the lookup at 187 uses EXACTLY the
 *   predicate that made the insert conflict, so the row it looks for is the row
 *   that just refused us. It can only be missing if a third actor deleted it in
 *   the two statements between — that actor exists (DELETE /v1/escrows/:id,
 *   creator-only, drafts-only), which is why the guard belongs here, but landing
 *   a delete inside a window with no seam is something a test can make likely
 *   and not certain. MEASURED: zero hits in the full-suite lcov, and changing
 *   what the line answers leaves this file and create-contract-body green.
 *
 *   escrows/_id/index.ts:77  'Escrow left draft state, it may have just been
 *   published' — the same shape one route over. The DELETE re-checks
 *   `status = 'draft'` in its WHERE, so a create confirming between the SELECT
 *   at :47 and the DELETE at :72 destroys nothing and answers this instead. A
 *   status change visible BEFORE the delete is refused earlier, at :51, with a
 *   different message, so reaching :77 means the change landing INSIDE the
 *   request, between two adjacent statements whose only gap is a driver
 *   round-trip. MEASURED: zero hits in the full-suite lcov; changing what it
 *   answers leaves escrows-lifecycle.test.ts (which drives the rest of that
 *   route) and this file green; and what a caller actually gets instead was run
 *   — a second sequential DELETE is 404 'escrow … not found' from
 *   `loadEscrowOr404`, a published one is the 409 at :51.
 *
 * Both are compare-and-swap guards whose failure mode is benign by design: they
 * can only fire when the row moved, and what they do about it is refuse. They
 * stay, and this note is what a future reader gets instead of a flaky test.
 */
