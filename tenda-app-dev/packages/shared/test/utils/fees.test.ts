import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computePlatformFee, computePlatformFeeRaw } from '../../src/utils/fees'

test('computePlatformFee: 2.5% (250 bps) of a round amount', () => {
  // 1 SOL = 1_000_000_000 lamports; 2.5% = 25_000_000.
  assert.equal(computePlatformFee(1_000_000_000n, 250), 25_000_000)
})

test('computePlatformFee: 1% (100 bps) seeker fee', () => {
  assert.equal(computePlatformFee(1_000_000_000n, 100), 10_000_000)
})

test('computePlatformFee: zero fee bps yields zero', () => {
  assert.equal(computePlatformFee(1_000_000_000n, 0), 0)
})

test('computePlatformFee: zero principal yields zero', () => {
  assert.equal(computePlatformFee(0n, 250), 0)
})

test('computePlatformFee: floor division truncates the remainder', () => {
  // 999 * 250 / 10000 = 24.975 -> 24 (BigInt division floors).
  assert.equal(computePlatformFee(999n, 250), 24)
})

test('computePlatformFee: sub-unit fee truncates to zero', () => {
  // 1 * 250 / 10000 = 0.025 -> 0.
  assert.equal(computePlatformFee(1n, 250), 0)
})

test('computePlatformFee: large principal stays exact past Number precision limits of intermediate math', () => {
  // 10_000 SOL: BigInt multiply avoids the float overflow a number*number would hit.
  const tenThousandSol = 10_000n * 1_000_000_000n
  assert.equal(computePlatformFee(tenThousandSol, 250), 250_000_000_000)
})

test('computePlatformFee: 100% (10000 bps) returns the full principal', () => {
  assert.equal(computePlatformFee(1_000_000_000n, 10_000), 1_000_000_000)
})

test('computePlatformFeeRaw: BigInt-exact for 18-dp principals past Number.MAX_SAFE_INTEGER', () => {
  // 1 ETH (1e18 base units); 2.5% fee = 2.5e16, which exceeds MAX_SAFE_INTEGER
  // (~9.007e15) — the Number-returning variant would lose precision here.
  const oneEth = 1_000_000_000_000_000_000n
  assert.equal(computePlatformFeeRaw(oneEth, 250), 25_000_000_000_000_000n)
  // Net payout stays exact to the base unit.
  assert.equal(oneEth - computePlatformFeeRaw(oneEth, 250), 975_000_000_000_000_000n)
})

test('computePlatformFeeRaw: floors the remainder like the on-chain contract', () => {
  assert.equal(computePlatformFeeRaw(999n, 250), 24n)
  assert.equal(computePlatformFeeRaw(0n, 250), 0n)
})
