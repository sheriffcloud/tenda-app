/**
 * `drizzleP2pFulfilment().open()` — its two refusals (#99).
 *
 * `assetRateSource`, one of the file's three exports, got its refusal tests in
 * #97; these are the two the coverage walk left behind, 115-116 and 142-147,
 * both 503s that no test executed. A refusal nobody runs is a refusal nobody
 * can rely on: delete it, change its status, or break its message and every
 * test still passes. That is not hypothetical — #98 measured exactly that shape
 * one file away.
 *
 * WHY THE MESSAGE IS ASSERTED, not just the status. Every refusal in `open()`
 * is a 503 PROVIDER_UNAVAILABLE, and the onramp direction has TWO of them: no
 * matched offer at all (115), and a matched offer that is no longer live (131).
 * A status-only assertion passes whether the guard under test fired or the one
 * after it did. The mutation proof for the onramp case is precisely that: with
 * the guard replaced by a fallback offer id, `open()` still rejects, still with
 * 503 PROVIDER_UNAVAILABLE, and only the message tells the two apart.
 *
 * HOW REACHABLE IS THE ONRAMP GUARD? Not through today's HTTP path, and the
 * call path says so rather than a guess. `initiateIntent` (service/intents.ts)
 * passes `quote_ref` from the cached `StoredQuote`, where it is a required
 * `string`, and `p2pInternalProvider.initiate` forwards it as `offer_ref` for
 * onramp. The one seam that does not enforce that type is the cache itself: a
 * `StoredQuote` is JSON round-tripped through Redis, so a quote written by a
 * deployment whose shape differed and read back inside QUOTE_TTL_MS (10 min)
 * arrives with `offer_ref` undefined and nothing in between to notice. That is
 * the "quote and initiate disagree" state the guard exists for. Separately,
 * `P2pFulfilment.open` is an exported seam that declares `offer_ref?: string` —
 * optional — so any caller of it may omit the field. Testing it at the seam is
 * therefore testing it where it is actually reachable, not inventing an input.
 *
 * The offramp guard needs no such argument: it fires whenever the asset has no
 * `assets` row, and the harness truncates and re-seeds that table per test.
 *
 * NEITHER IS A LIVE BUG and this task changes no production code. The quote
 * route already refuses an unmatched onramp (503) and an unregistered asset
 * (422 'unknown asset for this chain'), so both of these are the second line.
 *
 * Both positives below are CONTROLS, not new coverage: without one, every
 * refusal here is satisfiable by an `open()` that throws unconditionally. The
 * route-level positives live in integration/exchange-p2p.test.ts, which this
 * file deliberately does not grow.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { escrows } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import type { AppError } from '@server/lib/errors'
import { drizzleP2pFulfilment } from '@server/features/fiat-rails/p2p-live'
import {
  TEST_DB_CONFIGURED,
  TEST_CHAIN_ID,
  TEST_NATIVE_ASSET,
  useTestApp,
  createUser,
  createEscrow,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** An asset id the harness never seeds, so `assets` cannot hold a row for it. */
const UNREGISTERED_ASSET = 'NOT_A_REGISTERED_ASSET'

/** The guard names the asset it could not find, so the case reads it back. */
const UNREGISTERED_ASSET_REFUSAL = new RegExp(`asset '${UNREGISTERED_ASSET}' is not registered`)

/** Shared offramp terms; only `asset` differs between the two offramp cases. */
function offrampInput(user_id: string, asset: string) {
  return {
    user_id,
    direction: 'offramp' as const,
    fiat_currency: 'NGN',
    fiat_amount: 10_000,
    asset,
    asset_amount_raw: '6500000000',
    rate: 1_538.46,
  }
}

/** Shared onramp terms; `offer_ref` is omitted by the case that tests its absence. */
function onrampInput(user_id: string, offer_ref?: string) {
  return {
    user_id,
    direction: 'onramp' as const,
    fiat_currency: 'NGN',
    fiat_amount: 10_000,
    asset: TEST_NATIVE_ASSET,
    asset_amount_raw: '6500000000',
    rate: 1_538.46,
    ...(offer_ref !== undefined ? { offer_ref } : {}),
  }
}

/**
 * A refusal is a 503 PROVIDER_UNAVAILABLE that says WHICH refusal it is.
 *
 * The status and code are common to all three of `open()`'s throws, so the
 * regex is the only part that ties a case to the guard it names.
 */
async function assertRefusal(
  op: Promise<{ offer_id: string }>,
  message: RegExp,
): Promise<void> {
  await assert.rejects(op, (err: AppError) => {
    assert.strictEqual(err.statusCode, 503)
    assert.strictEqual(err.code, ErrorCode.PROVIDER_UNAVAILABLE)
    assert.match(err.message, message)
    return true
  })
}

test('open() onramp: an intent carrying no matched offer is refused 503', { skip }, async () => {
  const app = getApp()
  const buyer = await createUser(app)

  await assertRefusal(
    drizzleP2pFulfilment(app).open(onrampInput(buyer.row.id)),
    /carries no matched offer/,
  )
})

test('open() onramp: a live matched offer is returned (the control)', { skip }, async () => {
  const app = getApp()
  const buyer = await createUser(app)
  const seller = await createUser(app)
  // Only the escrows row matters here: the re-check query reads `escrows`
  // alone, so no exchange_details row is needed to make the offer live.
  const offer = await createEscrow(app, {
    creator_id: seller.row.id,
    kind: 'exchange',
    status: 'open',
    asset: TEST_NATIVE_ASSET,
  })

  const result = await drizzleP2pFulfilment(app).open(onrampInput(buyer.row.id, offer.id))
  assert.strictEqual(result.offer_id, offer.id)
})

test('open() onramp: an offer id that is not live is a DIFFERENT 503', { skip }, async () => {
  // The reason the case above asserts a message rather than a status. This is
  // the refusal at 131, reached with a well-formed id no live offer carries;
  // both answer 503 PROVIDER_UNAVAILABLE and only the text separates them.
  const app = getApp()
  const buyer = await createUser(app)

  await assertRefusal(
    drizzleP2pFulfilment(app).open(
      onrampInput(buyer.row.id, '00000000-0000-0000-0000-000000000000'),
    ),
    /no longer available/,
  )
})

test('open() offramp: an unregistered asset is refused 503, and no escrow leaks', { skip }, async () => {
  // The refusal must also land BEFORE the insert transaction, not alongside a
  // half-open draft — the "no offer leaks out" property the fiat/offramp
  // currency-mismatch case pins at the route level.
  //
  // The two halves are ONE test on purpose, and the mutation proof is why.
  // Split out, the row-count half read `await assert.rejects(open(...))` with
  // no predicate, and it survived the guard being removed: `escrows` carries a
  // COMPOSITE fk `escrows_asset_chain_fk` on (asset, chain_id), so an insert
  // with an unregistered asset is refused by postgres anyway, the driver error
  // satisfied the bare `rejects`, and the rollback left the count at zero. It
  // passed for a reason with nothing to do with the guard. Pinning the status,
  // code and message is what makes the rejection this guard's rejection.
  const app = getApp()
  const seller = await createUser(app)

  await assertRefusal(
    drizzleP2pFulfilment(app).open(offrampInput(seller.row.id, UNREGISTERED_ASSET)),
    UNREGISTERED_ASSET_REFUSAL,
  )
  const rows = await app.db
    .select({ id: escrows.id })
    .from(escrows)
    .where(eq(escrows.creator_id, seller.row.id))
  assert.strictEqual(rows.length, 0)
})

test('open() offramp: a registered asset opens the draft offer (the control)', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app)

  const { offer_id } = await drizzleP2pFulfilment(app).open(
    offrampInput(seller.row.id, TEST_NATIVE_ASSET),
  )
  const [row] = await app.db.select().from(escrows).where(eq(escrows.id, offer_id))
  assert.strictEqual(row.status, 'draft')
  assert.strictEqual(row.asset, TEST_NATIVE_ASSET)
  // Resolved from the assets row the refusal above could not find — which is
  // what that guard is protecting.
  assert.strictEqual(row.chain_id, TEST_CHAIN_ID)
})
