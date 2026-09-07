/**
 * escrowFeeBreakdown — the four rules behind every "X receives" figure.
 *
 * Three of them used to live inline in BOTH clients' useEscrowFee (tier
 * selection, percent formatting, payout contract) under docstrings claiming
 * the math "can never fork per surface". If they had drifted, web and mobile
 * would have shown different amounts for the SAME escrow. Proved here once.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escrowFeeBreakdown } from '../../src/utils/fees'
import type { PlatformConfig } from '../../src/api/contracts/platform.contract'

const CONFIG: PlatformConfig = { fee_bps: 100, seeker_fee_bps: 250, grace_period_seconds: 172_800 }

// ---------- the config gate -------------------------------------------------

test('every field is null until the config loads — never a fee guessed from nothing', () => {
  // A surface renders "—" from this. Answering 0 instead would state a fee of
  // zero as fact, which is a different claim from "we do not know yet".
  assert.deepEqual(escrowFeeBreakdown(null, false, '1000000'), {
    feeBps: null,
    feePct: null,
    feeRaw: null,
    netRaw: null,
  })
})

// ---------- the tier --------------------------------------------------------

test('the tier comes from the ESCROW flag, and the two tiers really differ', () => {
  const standard = escrowFeeBreakdown(CONFIG, false, '1000000')
  const seeker = escrowFeeBreakdown(CONFIG, true, '1000000')

  assert.equal(standard.feeBps, CONFIG.fee_bps)
  assert.equal(seeker.feeBps, CONFIG.seeker_fee_bps)
  assert.notEqual(standard.feeRaw, seeker.feeRaw)
  // Read off the config rather than hardcoded, so a config change cannot make
  // this test assert yesterday's rate.
  assert.equal(standard.feeRaw, (1_000_000n * BigInt(CONFIG.fee_bps)) / 10_000n)
  assert.equal(seeker.feeRaw, (1_000_000n * BigInt(CONFIG.seeker_fee_bps)) / 10_000n)
})

// ---------- the payout contract --------------------------------------------

test('net is principal MINUS fee — the contract pays out the remainder', () => {
  const { feeRaw, netRaw } = escrowFeeBreakdown(CONFIG, false, '1000000')
  assert.equal(feeRaw, 10_000n)
  assert.equal(netRaw, 990_000n)
  assert.equal((feeRaw ?? 0n) + (netRaw ?? 0n), 1_000_000n, 'nothing is created or lost')
})

test('an 18-decimal principal stays exact, past what a double can hold', () => {
  // 1250.75 cUSD. Number would round this; the whole reason the figures are
  // BigInt.
  const principal = '1250750000000000000000'
  const { feeRaw, netRaw } = escrowFeeBreakdown(CONFIG, false, principal)
  assert.equal(feeRaw, 12_507_500_000_000_000_000n)
  assert.equal((feeRaw ?? 0n) + (netRaw ?? 0n), BigInt(principal))
})

// ---------- where floor division bites --------------------------------------

test('the fee FLOORS, matching the contract — the remainder goes to the worker', () => {
  // 1 wei at 1%: the true fee is 0.01, and the contract's integer division
  // takes 0. Rounding up here would show a fee the chain will not charge.
  const one = escrowFeeBreakdown(CONFIG, false, '1')
  assert.equal(one.feeRaw, 0n)
  assert.equal(one.netRaw, 1n)

  // 99 at 1% floors to 0 as well; 100 is the first unit that yields 1.
  assert.equal(escrowFeeBreakdown(CONFIG, false, '99').feeRaw, 0n)
  assert.equal(escrowFeeBreakdown(CONFIG, false, '100').feeRaw, 1n)
})

test('a zero principal is a zero fee and a zero payout, not a division problem', () => {
  const zero = escrowFeeBreakdown(CONFIG, false, '0')
  assert.equal(zero.feeRaw, 0n)
  assert.equal(zero.netRaw, 0n)
})

test("'' means no amount yet and answers zero, which is what the composer shows", () => {
  // Documented behaviour rather than an accident: the money step renders this
  // before a budget is typed. `BigInt('')` is 0n.
  assert.equal(escrowFeeBreakdown(CONFIG, false, '').feeRaw, 0n)
  assert.equal(escrowFeeBreakdown(CONFIG, false, '').netRaw, 0n)
})

// ---------- the percentage --------------------------------------------------

test('the percentage is bps/100 to two places, for every tier shape', () => {
  assert.equal(escrowFeeBreakdown(CONFIG, false, '0').feePct, '1.00')
  assert.equal(escrowFeeBreakdown(CONFIG, true, '0').feePct, '2.50')
  // A whole-number and a sub-one-percent tier both read sensibly.
  const odd: PlatformConfig = { fee_bps: 5, seeker_fee_bps: 1000, grace_period_seconds: 0 }
  assert.equal(escrowFeeBreakdown(odd, false, '0').feePct, '0.05')
  assert.equal(escrowFeeBreakdown(odd, true, '0').feePct, '10.00')
})

test('a zero-fee platform is representable — not mistaken for an unloaded config', () => {
  // The distinction the null gate exists for: 0% is an answer, and it must not
  // render as "—".
  const free: PlatformConfig = { fee_bps: 0, seeker_fee_bps: 0, grace_period_seconds: 0 }
  const breakdown = escrowFeeBreakdown(free, false, '1000000')
  assert.equal(breakdown.feeBps, 0)
  assert.equal(breakdown.feePct, '0.00')
  assert.equal(breakdown.feeRaw, 0n)
  assert.equal(breakdown.netRaw, 1_000_000n)
})
