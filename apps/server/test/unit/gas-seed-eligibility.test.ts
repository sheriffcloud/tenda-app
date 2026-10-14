/**
 * The claim gate (#53c-1): who may claim, in what order the refusals are
 * reported, and which error each becomes.
 *
 * This file is where the guards are actually proved. The route is three lines
 * of plumbing and the service is orchestration; the DECISION is here, pure, so
 * every branch is reachable without a database, an RPC or a signed token — and
 * so a guard that stops working fails loudly rather than only in an HTTP
 * fixture nobody wrote.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { ErrorCode } from '@tenda/shared'
import {
  claimRefusal,
  evaluateClaim,
  grantState,
  type ChainClaimFacts,
  type ClaimantFacts,
} from '@server/features/gas-seed'

/** A claimant who passes every account-side gate. */
const OK_CLAIMANT: ClaimantFacts = {
  client: 'mobile',
  has_device_token: true,
  has_verified_phone: true,
  is_suspended: false,
  is_agent: false,
}

/** A chain that would pay, on a user who has not claimed. */
const OK_CHAIN: ChainClaimFacts = {
  chain_id: 'eip155:16661',
  amount_raw: '10000000000000000',
  sender_configured: true,
  claims_enabled: true,
  funder_balance: 10n ** 18n,
  wallet_address: '0xEvm',
  grant: null,
}

function claimant(over: Partial<ClaimantFacts>): ClaimantFacts {
  return { ...OK_CLAIMANT, ...over }
}
function chain(over: Partial<ChainClaimFacts>): ChainClaimFacts {
  return { ...OK_CHAIN, ...over }
}

// ---------- the happy path ----------------------------------------------------

test('a phone-verified app user with a wallet and a funded hot wallet may claim', () => {
  const verdict = evaluateClaim(OK_CLAIMANT, OK_CHAIN)
  assert.deepStrictEqual(verdict, {
    chain_id: 'eip155:16661',
    available: true,
    amount_raw: '10000000000000000',
    state: 'unclaimed',
    reason: null,
  })
})

// ---------- state derivation ---------------------------------------------------

test('grantState: only `delivered` reads as claimed; the other three are all in progress', () => {
  // The mapping the client sees. Three DB states collapse to `in_progress`
  // because they differ in what an operator must do, not in what the user can
  // do — and `unresolved` in particular must NOT read as `unclaimed`, or the
  // surface would offer a button for a slot that is still held.
  assert.strictEqual(grantState(null), 'unclaimed')
  assert.strictEqual(grantState({ status: 'claimed' }), 'in_progress')
  assert.strictEqual(grantState({ status: 'submitted' }), 'in_progress')
  assert.strictEqual(grantState({ status: 'unresolved' }), 'in_progress')
  assert.strictEqual(grantState({ status: 'delivered' }), 'claimed')
})

// A forgotten status is caught by the COMPILER, not from here. `CLIENT_STATE`
// is a total `Record<GasGrantStatus, GasSeedState>`, so adding a status without
// deciding what the client sees fails the build. The loop that used to sit here
// asserted every status produced `claimed` or `in_progress` — which a
// two-armed ternary satisfies unconditionally, for any input, so it could never
// have failed and never guarded what its name claimed.

test('a claimed grant is never re-offered, and reports itself as claimed', () => {
  const verdict = evaluateClaim(OK_CLAIMANT, chain({ grant: { status: 'delivered' } }))
  assert.strictEqual(verdict.available, false)
  assert.strictEqual(verdict.state, 'claimed')
  assert.strictEqual(verdict.reason, 'already_granted')
})

test('a DOUBLE TAP is told the claim is under way, never "already claimed"', () => {
  // The distinction the DoD calls out: a user who tapped twice must not be told
  // they already have gas they cannot see. `in_progress` covers the queued job,
  // the broadcast awaiting confirmation, and the one nobody could resolve — the
  // same correct behaviour for all three (do not offer it again).
  const verdict = evaluateClaim(
    OK_CLAIMANT,
    chain({ grant: { status: 'claimed' } }),
  )
  assert.strictEqual(verdict.state, 'in_progress')
  assert.strictEqual(verdict.reason, 'already_granted')
})

// ---------- each guard, negatively ----------------------------------------------

test('a chain with no declared seed offers nothing', () => {
  const verdict = evaluateClaim(OK_CLAIMANT, chain({ amount_raw: null }))
  assert.strictEqual(verdict.reason, 'not_offered')
  assert.strictEqual(verdict.amount_raw, null)
})

test('a chain whose hot-wallet key is not configured offers nothing', () => {
  // The deployment fact that never reaches the wire any other way: the chain is
  // seedable in the DB, but nothing can sign the transfer.
  assert.strictEqual(evaluateClaim(OK_CLAIMANT, chain({ sender_configured: false })).reason, 'not_offered')
})

test('a WEB session is refused with mobile_only, not with a chain-level excuse', () => {
  // Web must be able to render "claim in the app". Reporting a chain problem
  // here would send a web visitor to a support page about the wrong thing.
  assert.strictEqual(evaluateClaim(claimant({ client: null }), OK_CHAIN).reason, 'mobile_only')
})

test('a WEB-STAMPED session is refused BY VALUE, even with a registered device', () => {
  // The hole this closes: the gate used to ask only whether a client stamp was
  // PRESENT. A user who had installed the app — so a device_tokens row exists —
  // could then sign in on web, be stamped 'web', satisfy both halves, and claim
  // from the browser. The one client the gate exists to exclude was the one it
  // let through.
  const verdict = evaluateClaim(claimant({ client: 'web', has_device_token: true }), OK_CHAIN)
  assert.strictEqual(verdict.available, false)
  assert.strictEqual(verdict.reason, 'mobile_only')
})

test('an app session with no registered device is refused — both halves of the gate bind', () => {
  assert.strictEqual(
    evaluateClaim(claimant({ has_device_token: false }), OK_CHAIN).reason,
    'mobile_only',
  )
})

test('an unverified phone is refused with an ACTIONABLE reason', () => {
  assert.strictEqual(
    evaluateClaim(claimant({ has_verified_phone: false }), OK_CHAIN).reason,
    'phone_required',
  )
})

test('a suspended account is refused even though its token is still valid', () => {
  // The gap this closes: mintAuthResponse rejects a suspended user at LOGIN,
  // and JWTs outlive that check by days. A payout endpoint that trusted the
  // token would pay someone who was suspended after they signed in.
  assert.strictEqual(evaluateClaim(claimant({ is_suspended: true }), OK_CHAIN).reason, 'not_eligible')
})

test('an agent is refused — it funds gas through the relayer', () => {
  assert.strictEqual(evaluateClaim(claimant({ is_agent: true }), OK_CHAIN).reason, 'not_eligible')
})

test('an operator switching claims off for a chain refuses them', () => {
  assert.strictEqual(evaluateClaim(OK_CLAIMANT, chain({ claims_enabled: false })).reason, 'claims_disabled')
})

test('a user with no wallet on the chain has nowhere to be paid', () => {
  assert.strictEqual(evaluateClaim(OK_CLAIMANT, chain({ wallet_address: null })).reason, 'no_wallet')
})

test('a hot wallet that cannot cover ONE grant refuses the claim', () => {
  // Exactly one wei short — the boundary, not a comfortable margin, because an
  // off-by-one here either strands the last claimable grant or promises one the
  // chain will reject.
  const short = chain({ funder_balance: BigInt(OK_CHAIN.amount_raw ?? '0') - 1n })
  assert.strictEqual(evaluateClaim(OK_CLAIMANT, short).reason, 'funder_empty')

  const exact = chain({ funder_balance: BigInt(OK_CHAIN.amount_raw ?? '0') })
  assert.strictEqual(evaluateClaim(OK_CLAIMANT, exact).available, true)
})

test('an UNREADABLE balance refuses the claim rather than assuming the wallet is fine', () => {
  // A chain whose RPC is down cannot pay. Treating null as "probably fine"
  // would offer a claim that fails, costing the user a tap and the slot a
  // needless release.
  assert.strictEqual(evaluateClaim(OK_CLAIMANT, chain({ funder_balance: null })).reason, 'funder_empty')
})

// ---------- refusal ORDER, which is a behaviour of its own -----------------------

test('a web user on a switched-off chain is told to use the app, not that the chain is off', () => {
  // Both are true; only one is something they can act on. This ordering is what
  // makes the reason field worth rendering at all.
  const verdict = evaluateClaim(claimant({ client: null }), chain({ claims_enabled: false }))
  assert.strictEqual(verdict.reason, 'mobile_only')
})

test('a chain that offers nothing says so even to a perfectly eligible user', () => {
  // not_offered outranks every account gate: reporting "verify your phone" for
  // a chain with no seed would send someone through a flow that changes nothing.
  const verdict = evaluateClaim(claimant({ has_verified_phone: false }), chain({ amount_raw: null }))
  assert.strictEqual(verdict.reason, 'not_offered')
})

test('the balance is the LAST check, so an already-granted user never depends on it', () => {
  // Load-bearing: the service reads the balance only when a null-balance pass
  // returns funder_empty, which is only true when everything else passed. If
  // any check moved below the balance, that optimisation would start skipping
  // a real refusal.
  const verdict = evaluateClaim(
    OK_CLAIMANT,
    chain({ funder_balance: null, grant: { status: 'delivered' } }),
  )
  assert.strictEqual(verdict.reason, 'already_granted')
})

// ---------- refusal → error ------------------------------------------------------

test('each refusal maps to the status and code a client can branch on', () => {
  const cases: Array<[Parameters<typeof claimRefusal>[0]['reason'], number, string]> = [
    ['mobile_only', 403, ErrorCode.GAS_SEED_MOBILE_ONLY],
    ['phone_required', 403, ErrorCode.PHONE_VERIFICATION_REQUIRED],
    ['not_eligible', 403, ErrorCode.GAS_SEED_NOT_FOR_AGENTS],
    ['no_wallet', 403, ErrorCode.WALLET_REQUIRED],
    ['not_offered', 409, ErrorCode.GAS_SEED_UNAVAILABLE],
    ['claims_disabled', 409, ErrorCode.GAS_SEED_UNAVAILABLE],
    ['funder_empty', 409, ErrorCode.GAS_SEED_UNAVAILABLE],
    ['already_granted', 409, ErrorCode.GAS_SEED_UNAVAILABLE],
  ]
  for (const [reason, status, code] of cases) {
    const err = claimRefusal({
      chain_id: 'solana:devnet',
      available: false,
      amount_raw: '5000000',
      state: 'unclaimed',
      reason,
    })
    assert.strictEqual(err.statusCode, status, `${String(reason)} status`)
    assert.strictEqual(err.code, code, `${String(reason)} code`)
  }
})

test('the no-wallet refusal names the chain, so the client opens the right link flow', () => {
  const err = claimRefusal({
    chain_id: 'eip155:16661',
    available: false,
    amount_raw: '1',
    state: 'unclaimed',
    reason: 'no_wallet',
  })
  assert.deepStrictEqual(err.details, { chain_id: 'eip155:16661' })
})
