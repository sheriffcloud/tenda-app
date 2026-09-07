import { test } from 'node:test'
import * as assert from 'node:assert'
import { AppError } from '@server/lib/errors'
import {
  type Caller,
  type EscrowStatus,
  type EscrowTransition,
  type TransitionContext,
  acceptedAt,
  assertCanTransition,
  assertGigAsset,
  assertExchangeAsset,
  computeAcceptDeadline,
  computeApprovalDeadline,
  computeCompletionDeadline,
  computeNetPayout,
  computePlatformFee,
  nextStatus,
  transition,
} from '@server/lib/escrow'

// ---------- fixtures ------------------------------------------------------

const T0 = new Date('2026-06-01T00:00:00Z')
const T_PAST = new Date('2026-05-01T00:00:00Z')
const T_FUTURE = new Date('2026-07-01T00:00:00Z')

function ctx(overrides: Partial<TransitionContext> = {}): TransitionContext {
  return {
    status: 'open',
    caller: 'creator',
    now: T0,
    accept_deadline: T_FUTURE,
    completion_deadline: T_FUTURE,
    approval_deadline: T_FUTURE,
    grace_period_seconds: 3600,
    is_assigned: false,
    // Instant mode by default — every pre-existing case assumes it.
    requires_approval: false,
    completion_duration_seconds: 7200,
    unassign_window_seconds: 6 * 3600,
    ...overrides,
  }
}

function expectError(fn: () => void, code: string): AppError {
  try {
    fn()
  } catch (err) {
    if (err instanceof AppError) {
      assert.strictEqual(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`)
      return err
    }
    throw err
  }
  assert.fail(`expected throw with code ${code}`)
}

// ---------- nextStatus: every legal transition produces the right status -

const LEGAL_TRANSITIONS: ReadonlyArray<[EscrowTransition, EscrowStatus, EscrowStatus, Caller, Partial<TransitionContext>?]> = [
  // [transition, from, to, caller, extra ctx]
  ['publish', 'draft', 'open', 'creator'],
  ['accept', 'open', 'accepted', 'counterparty'],
  ['accept', 'open', 'accepted', 'assigned_counterparty', { is_assigned: true }],
  ['decline', 'open', 'open', 'assigned_counterparty', { is_assigned: true }],
  ['assign_accept', 'open', 'accepted', 'creator', { requires_approval: true }],
  // The one BACKWARD edge in the machine.
  ['unassign', 'accepted', 'open', 'creator', { requires_approval: true, completion_deadline: T0 }],
  ['cancel', 'open', 'cancelled', 'creator'],
  ['refund_expired', 'open', 'refunded', 'creator', { accept_deadline: T_PAST }],
  ['submit', 'accepted', 'submitted', 'counterparty'],
  ['reclaim_abandoned', 'accepted', 'refunded', 'creator', { completion_deadline: T_PAST, grace_period_seconds: 0 }],
  ['dispute', 'accepted', 'disputed', 'creator'],
  ['dispute', 'accepted', 'disputed', 'counterparty'],
  ['dispute', 'submitted', 'disputed', 'creator'],
  ['dispute', 'submitted', 'disputed', 'counterparty'],
  ['approve', 'submitted', 'completed', 'creator'],
  ['claim_stalled', 'submitted', 'completed', 'counterparty', { approval_deadline: T_PAST }],
  ['resolve', 'disputed', 'resolved', 'dispute_admin'],
]

for (const [t, from, to, caller, extra] of LEGAL_TRANSITIONS) {
  test(`nextStatus: ${from} --${t}(${caller})--> ${to}`, () => {
    const c = ctx({ status: from, caller, ...(extra ?? {}) })
    assertCanTransition(c, t)
    assert.strictEqual(nextStatus(c, t), to)
    // transition() convenience returns the same.
    assert.strictEqual(transition(c, t), to)
  })
}

// ---------- assertCanTransition: wrong status ----------------------------

const TERMINAL: ReadonlyArray<EscrowStatus> = ['completed', 'cancelled', 'refunded', 'resolved']

for (const status of TERMINAL) {
  test(`assertCanTransition: any transition from terminal '${status}' → ESCROW_WRONG_STATUS`, () => {
    expectError(() => assertCanTransition(ctx({ status }), 'accept'), 'ESCROW_WRONG_STATUS')
    expectError(() => assertCanTransition(ctx({ status }), 'dispute'), 'ESCROW_WRONG_STATUS')
  })
}

test('assertCanTransition: dispute from open → ESCROW_WRONG_STATUS', () => {
  expectError(() => assertCanTransition(ctx({ status: 'open' }), 'dispute'), 'ESCROW_WRONG_STATUS')
})

test('assertCanTransition: dispute from draft → ESCROW_WRONG_STATUS', () => {
  expectError(() => assertCanTransition(ctx({ status: 'draft' }), 'dispute'), 'ESCROW_WRONG_STATUS')
})

test('assertCanTransition: accept from accepted → ESCROW_WRONG_STATUS', () => {
  expectError(
    () => assertCanTransition(ctx({ status: 'accepted', caller: 'counterparty' }), 'accept'),
    'ESCROW_WRONG_STATUS',
  )
})

test('assertCanTransition: decline on unassigned escrow → ESCROW_WRONG_STATUS', () => {
  expectError(
    () => assertCanTransition(ctx({ status: 'open', caller: 'assigned_counterparty', is_assigned: false }), 'decline'),
    'ESCROW_WRONG_STATUS',
  )
})

// ---------- assertCanTransition: wrong caller ---------------------------

const WRONG_CALLER_CASES: ReadonlyArray<[EscrowTransition, EscrowStatus, Caller, Partial<TransitionContext>?]> = [
  ['publish', 'draft', 'counterparty'],
  ['accept', 'open', 'creator'], // creator can't accept own escrow
  ['accept', 'open', 'assigned_counterparty'], // public escrow, but caller is assigned
  ['accept', 'open', 'counterparty', { is_assigned: true }], // assigned escrow, but caller is generic counterparty
  ['cancel', 'open', 'counterparty'],
  ['cancel', 'open', 'assigned_counterparty'],
  ['refund_expired', 'open', 'counterparty', { accept_deadline: T_PAST }],
  ['submit', 'accepted', 'creator'],
  ['reclaim_abandoned', 'accepted', 'counterparty', { completion_deadline: T_PAST, grace_period_seconds: 0 }],
  ['approve', 'submitted', 'counterparty'],
  ['claim_stalled', 'submitted', 'creator', { approval_deadline: T_PAST }],
  ['resolve', 'disputed', 'creator'],
  ['resolve', 'disputed', 'counterparty'],
  ['dispute', 'accepted', 'dispute_admin'],
  ['dispute', 'submitted', 'assigned_counterparty'],
  ['decline', 'open', 'creator', { is_assigned: true }],
  ['decline', 'open', 'counterparty', { is_assigned: true }],
]

for (const [t, from, caller, extra] of WRONG_CALLER_CASES) {
  test(`assertCanTransition: ${t} from ${from} as ${caller} → ESCROW_WRONG_CALLER`, () => {
    expectError(
      () => assertCanTransition(ctx({ status: from, caller, ...(extra ?? {}) }), t),
      'ESCROW_WRONG_CALLER',
    )
  })
}

// ---------- assertCanTransition: deadline gates ------------------------

test('accept after accept_deadline → ESCROW_DEADLINE_PASSED', () => {
  expectError(
    () => assertCanTransition(ctx({ status: 'open', caller: 'counterparty', accept_deadline: T_PAST }), 'accept'),
    'ESCROW_DEADLINE_PASSED',
  )
})

test('accept exactly AT accept_deadline → ESCROW_DEADLINE_PASSED (inclusive boundary)', () => {
  expectError(
    () => assertCanTransition(ctx({ status: 'open', caller: 'counterparty', accept_deadline: T0 }), 'accept'),
    'ESCROW_DEADLINE_PASSED',
  )
})

test('refund_expired before accept_deadline → ESCROW_DEADLINE_NOT_REACHED', () => {
  expectError(
    () => assertCanTransition(ctx({ status: 'open', caller: 'creator', accept_deadline: T_FUTURE }), 'refund_expired'),
    'ESCROW_DEADLINE_NOT_REACHED',
  )
})

test('refund_expired exactly AT accept_deadline → legal (inclusive)', () => {
  assertCanTransition(ctx({ status: 'open', caller: 'creator', accept_deadline: T0 }), 'refund_expired')
})

test('submit before completion_deadline+grace → legal', () => {
  assertCanTransition(
    ctx({ status: 'accepted', caller: 'counterparty', completion_deadline: T_FUTURE, grace_period_seconds: 3600 }),
    'submit',
  )
})

test('submit after completion_deadline but within grace → legal', () => {
  // completion was 1 minute ago, grace is 1 hour → still legal
  assertCanTransition(
    ctx({
      status: 'accepted',
      caller: 'counterparty',
      completion_deadline: new Date(T0.getTime() - 60_000),
      grace_period_seconds: 3600,
    }),
    'submit',
  )
})

test('submit past completion_deadline+grace → ESCROW_DEADLINE_PASSED', () => {
  expectError(
    () => assertCanTransition(
      ctx({
        status: 'accepted',
        caller: 'counterparty',
        completion_deadline: T_PAST,
        grace_period_seconds: 3600, // T_PAST + 1h is still in the past
      }),
      'submit',
    ),
    'ESCROW_DEADLINE_PASSED',
  )
})

test('reclaim_abandoned before completion_deadline+grace → ESCROW_DEADLINE_NOT_REACHED', () => {
  expectError(
    () => assertCanTransition(
      ctx({ status: 'accepted', caller: 'creator', completion_deadline: T_FUTURE, grace_period_seconds: 3600 }),
      'reclaim_abandoned',
    ),
    'ESCROW_DEADLINE_NOT_REACHED',
  )
})

test('claim_stalled before approval_deadline → ESCROW_DEADLINE_NOT_REACHED', () => {
  expectError(
    () => assertCanTransition(
      ctx({ status: 'submitted', caller: 'counterparty', approval_deadline: T_FUTURE }),
      'claim_stalled',
    ),
    'ESCROW_DEADLINE_NOT_REACHED',
  )
})

test('claim_stalled at approval_deadline → legal (inclusive)', () => {
  assertCanTransition(
    ctx({ status: 'submitted', caller: 'counterparty', approval_deadline: T0 }),
    'claim_stalled',
  )
})

// ---------- defensive: missing required deadline → INTERNAL_ERROR --------

test('submit with null completion_deadline → INTERNAL_ERROR (schema invariant violated)', () => {
  expectError(
    () => assertCanTransition(ctx({ status: 'accepted', caller: 'counterparty', completion_deadline: null }), 'submit'),
    'INTERNAL_ERROR',
  )
})

test('claim_stalled with null approval_deadline → INTERNAL_ERROR', () => {
  expectError(
    () => assertCanTransition(ctx({ status: 'submitted', caller: 'counterparty', approval_deadline: null }), 'claim_stalled'),
    'INTERNAL_ERROR',
  )
})

// ---------- fee math ------------------------------------------------------

test('computePlatformFee: 1 USDC × 250 bps = 0.025 USDC', () => {
  // 1 USDC at 6 decimals = 1_000_000 raw; 2.5% = 25_000 raw
  const fee = computePlatformFee({
    amount_raw: '1000000',
    is_seeker: false,
    fee_bps: 250,
    seeker_fee_bps: 100,
  })
  assert.strictEqual(fee, '25000')
})

test('computePlatformFee: seeker rate used when is_seeker=true', () => {
  const fee = computePlatformFee({
    amount_raw: '1000000',
    is_seeker: true,
    fee_bps: 250,
    seeker_fee_bps: 100,
  })
  assert.strictEqual(fee, '10000') // 1% of 1_000_000
})

test('computePlatformFee: zero fee_bps → zero fee', () => {
  const fee = computePlatformFee({
    amount_raw: '999999999999',
    is_seeker: false,
    fee_bps: 0,
    seeker_fee_bps: 0,
  })
  assert.strictEqual(fee, '0')
})

test('computePlatformFee: full fee_bps (10000) → entire amount', () => {
  const fee = computePlatformFee({
    amount_raw: '1234567',
    is_seeker: false,
    fee_bps: 10000,
    seeker_fee_bps: 0,
  })
  assert.strictEqual(fee, '1234567')
})

test('computePlatformFee: truncates toward zero on sub-unit fee', () => {
  // 1 lamport × 250 bps / 10000 = 0.025 → truncates to 0
  const fee = computePlatformFee({
    amount_raw: '1',
    is_seeker: false,
    fee_bps: 250,
    seeker_fee_bps: 0,
  })
  assert.strictEqual(fee, '0')
})

test('computePlatformFee: amount near numeric(78,0) max', () => {
  // 10^77 — well within numeric(78,0) and BigInt range
  const huge = '1' + '0'.repeat(77)
  const fee = computePlatformFee({
    amount_raw: huge,
    is_seeker: false,
    fee_bps: 250,
    seeker_fee_bps: 0,
  })
  // (10^77 × 250) / 10000 = (25 × 10^78) / 10^4 = 25 × 10^74
  assert.strictEqual(fee, '25' + '0'.repeat(74))
})

test('computeNetPayout: payout = amount - fee', () => {
  const net = computeNetPayout({
    amount_raw: '1000000',
    is_seeker: false,
    fee_bps: 250,
    seeker_fee_bps: 0,
  })
  assert.strictEqual(net, '975000')
})

test('computeNetPayout: full fee → zero net', () => {
  const net = computeNetPayout({
    amount_raw: '1000',
    is_seeker: false,
    fee_bps: 10000,
    seeker_fee_bps: 0,
  })
  assert.strictEqual(net, '0')
})

// ---------- deadline math ------------------------------------------------

test('computeAcceptDeadline: adds seconds correctly', () => {
  const d = computeAcceptDeadline({ now: T0, accept_window_seconds: 3600 })
  assert.strictEqual(d.getTime(), T0.getTime() + 3_600_000)
})

test('computeCompletionDeadline: monotonic', () => {
  const d1 = computeCompletionDeadline({ accepted_at: T0, completion_duration_seconds: 100 })
  const d2 = computeCompletionDeadline({ accepted_at: T0, completion_duration_seconds: 101 })
  assert.ok(d2.getTime() > d1.getTime())
})

test('computeApprovalDeadline: zero-second window returns submitted_at', () => {
  const d = computeApprovalDeadline({ submitted_at: T0, approval_window_seconds: 0 })
  assert.strictEqual(d.getTime(), T0.getTime())
})

test('computeAcceptDeadline: 1-second precision preserved', () => {
  const d = computeAcceptDeadline({ now: T0, accept_window_seconds: 1 })
  assert.strictEqual(d.getTime() - T0.getTime(), 1000)
})

// ---------- assertGigAsset -----------------------------------------------

test('assertGigAsset: USDC_SOL on solana:mainnet passes', () => {
  assertGigAsset('USDC_SOL', 'solana:mainnet')
})

test('assertGigAsset: USDC_SOL on solana:devnet passes (Stage 0 cutover)', () => {
  assertGigAsset('USDC_SOL', 'solana:devnet')
})

test('assertGigAsset: USDC_BASE on eip155:8453 passes', () => {
  assertGigAsset('USDC_BASE', 'eip155:8453')
})

test('assertGigAsset: USDC_BASE on eip155:84532 (Base Sepolia) passes', () => {
  assertGigAsset('USDC_BASE', 'eip155:84532')
})

test('assertGigAsset: USDC_CELO on eip155:42220 passes', () => {
  assertGigAsset('USDC_CELO', 'eip155:42220')
})

test('assertGigAsset: eip155:44787 (Alfajores, not in the manifest) → ESCROW_INVALID_ASSET', () => {
  // Alfajores is not a supported chain (absent from CHAIN_MANIFEST); the guard
  // now reads the manifest as the single source, so it rejects rather than
  // relying on the retired standalone map.
  expectError(() => assertGigAsset('USDC_CELO', 'eip155:44787'), 'ESCROW_INVALID_ASSET')
})

test('assertGigAsset: unknown chain → ESCROW_INVALID_ASSET (422)', () => {
  const err = expectError(
    () => assertGigAsset('USDC_BASE', 'eip155:1'),
    'ESCROW_INVALID_ASSET',
  )
  assert.strictEqual(err.statusCode, 422)
})

test('assertGigAsset: non-USDC asset on known chain → ESCROW_INVALID_ASSET', () => {
  const err = expectError(
    () => assertGigAsset('SOL', 'solana:mainnet'),
    'ESCROW_INVALID_ASSET',
  )
  assert.strictEqual(err.statusCode, 422)
})

test('assertGigAsset: cUSD on CELO rejected (locked decision #3 — USDC only)', () => {
  expectError(() => assertGigAsset('cUSD', 'eip155:42220'), 'ESCROW_INVALID_ASSET')
})

test('assertGigAsset: cross-chain USDC rejected (USDC_BASE on solana)', () => {
  expectError(() => assertGigAsset('USDC_BASE', 'solana:mainnet'), 'ESCROW_INVALID_ASSET')
})

test('assertGigAsset: empty strings rejected', () => {
  expectError(() => assertGigAsset('', 'solana:mainnet'), 'ESCROW_INVALID_ASSET')
  expectError(() => assertGigAsset('USDC_SOL', ''), 'ESCROW_INVALID_ASSET')
})

// ---------- assertExchangeAsset (USDC + native per chain) ----------------

test('assertExchangeAsset: native token is tradable on every chain', () => {
  assertExchangeAsset('SOL', 'solana:mainnet')
  assertExchangeAsset('SOL_DEVNET', 'solana:devnet')
  assertExchangeAsset('ETH_BASE', 'eip155:8453')
  assertExchangeAsset('ETH_BASE', 'eip155:84532')
  assertExchangeAsset('CELO', 'eip155:42220')
})

test('assertExchangeAsset: USDC is also tradable on every chain (roles overlap)', () => {
  assertExchangeAsset('USDC_SOL', 'solana:mainnet')
  assertExchangeAsset('USDC_SOL', 'solana:devnet')
  assertExchangeAsset('USDC_BASE', 'eip155:8453')
  assertExchangeAsset('USDC_CELO', 'eip155:42220')
})

test('assertExchangeAsset: cUSD tradable on CELO (exchange asset, unlike gigs)', () => {
  assertExchangeAsset('cUSD', 'eip155:42220')
})

test('assertExchangeAsset: unknown chain → ESCROW_INVALID_ASSET (422)', () => {
  const err = expectError(() => assertExchangeAsset('ETH_BASE', 'eip155:1'), 'ESCROW_INVALID_ASSET')
  assert.strictEqual(err.statusCode, 422)
})

test('assertExchangeAsset: unlisted asset on a known chain → ESCROW_INVALID_ASSET', () => {
  // USDC_SOL is not registered on Base.
  expectError(() => assertExchangeAsset('USDC_SOL', 'eip155:8453'), 'ESCROW_INVALID_ASSET')
})

test('assertExchangeAsset: cross-chain native rejected (SOL on Base)', () => {
  expectError(() => assertExchangeAsset('SOL', 'eip155:8453'), 'ESCROW_INVALID_ASSET')
})

test('assertExchangeAsset: empty strings rejected', () => {
  expectError(() => assertExchangeAsset('', 'solana:mainnet'), 'ESCROW_INVALID_ASSET')
  expectError(() => assertExchangeAsset('SOL', ''), 'ESCROW_INVALID_ASSET')
})

// ---------- approval mode (stage 10) ---------------------------------------

const APPROVAL = { requires_approval: true } as const

test('accept is CLOSED on an approval-mode gig — applying is the only way in', () => {
  const e = expectError(() => assertCanTransition(ctx({ ...APPROVAL, caller: 'counterparty' }), 'accept'), 'ESCROW_WRONG_STATUS')
  assert.match(e.message, /approval-only/)
})

test('assign_accept / unassign are refused on an instant-mode gig', () => {
  // requires_approval is the witness that the worker was PLACED. Without it,
  // a worker accepted for themselves and the poster may not undo that.
  expectError(() => assertCanTransition(ctx({ caller: 'creator' }), 'assign_accept'), 'ESCROW_WRONG_STATUS')
  expectError(
    () => assertCanTransition(ctx({ status: 'accepted', caller: 'creator' }), 'unassign'),
    'ESCROW_WRONG_STATUS',
  )
})

test('assign_accept: only the creator, only from open, only before the accept deadline', () => {
  for (const caller of ['counterparty', 'assigned_counterparty', 'dispute_admin'] as const) {
    expectError(() => assertCanTransition(ctx({ ...APPROVAL, caller }), 'assign_accept'), 'ESCROW_WRONG_CALLER')
  }
  expectError(
    () => assertCanTransition(ctx({ ...APPROVAL, status: 'accepted', caller: 'creator' }), 'assign_accept'),
    'ESCROW_WRONG_STATUS',
  )
  expectError(
    () => assertCanTransition(ctx({ ...APPROVAL, caller: 'creator', accept_deadline: T_PAST }), 'assign_accept'),
    'ESCROW_DEADLINE_PASSED',
  )
})

test('unassign: only the creator, and only from accepted', () => {
  const base = { ...APPROVAL, status: 'accepted' as const, completion_deadline: T0 }
  for (const caller of ['counterparty', 'assigned_counterparty', 'dispute_admin'] as const) {
    expectError(() => assertCanTransition(ctx({ ...base, caller }), 'unassign'), 'ESCROW_WRONG_CALLER')
  }
  for (const status of ['open', 'submitted', 'disputed'] as const) {
    expectError(
      () => assertCanTransition(ctx({ ...APPROVAL, status, caller: 'creator' }), 'unassign'),
      'ESCROW_WRONG_STATUS',
    )
  }
})

// The window runs from when the escrow was ACCEPTED, which nothing stores —
// it is derived as completion_deadline − completion_duration, exactly as both
// contracts derive it. These pin the derivation, not just the comparison.
test('unassign: the window is measured from the DERIVED accept time', () => {
  const accepted = new Date('2026-06-01T00:00:00Z') // == T0
  const duration = 7200
  const window = 3600
  const base = {
    ...APPROVAL,
    status: 'accepted' as const,
    caller: 'creator' as const,
    completion_duration_seconds: duration,
    unassign_window_seconds: window,
    completion_deadline: new Date(accepted.getTime() + duration * 1000),
  }
  // Just inside.
  assertCanTransition(ctx({ ...base, now: new Date(accepted.getTime() + (window - 1) * 1000) }), 'unassign')
  // Exactly at the boundary is CLOSED, matching the contracts' `>=`.
  expectError(
    () => assertCanTransition(ctx({ ...base, now: new Date(accepted.getTime() + window * 1000) }), 'unassign'),
    'ESCROW_DEADLINE_PASSED',
  )
})

test('unassign: a zero window is shut immediately', () => {
  const base = {
    ...APPROVAL,
    status: 'accepted' as const,
    caller: 'creator' as const,
    completion_deadline: T0,
    unassign_window_seconds: 0,
  }
  expectError(() => assertCanTransition(ctx(base), 'unassign'), 'ESCROW_DEADLINE_PASSED')
})

test('acceptedAt: derives, and is null before the escrow is accepted', () => {
  const duration = 7200
  const deadline = new Date(T0.getTime() + duration * 1000)
  assert.deepStrictEqual(
    acceptedAt(ctx({ completion_deadline: deadline, completion_duration_seconds: duration })),
    T0,
  )
  assert.strictEqual(acceptedAt(ctx({ completion_deadline: null })), null)
  assert.strictEqual(acceptedAt(ctx({ completion_duration_seconds: null })), null)
})
