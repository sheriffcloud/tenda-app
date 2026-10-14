/**
 * The pure half of the fee check: what a valid pair is, reading every chain without one
 * failure costing the rest, and comparing. The wiring (boot, scripts) is the integration
 * suite and scripts' own tests; this is the part whose every branch is a decision.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESCROW_LIMITS } from '@tenda/shared'
import { compareFees, describeComparison, feeCheckExitCode, feePairProblem, readChainFees } from '@server/features/platform-fees/fees'

const CONFIGURED = { fee_bps: 250, seeker_fee_bps: 100 }
const ok = (chain_id: string, fee_bps: number, seeker_fee_bps: number) => ({ chain_id, getFees: async () => ({ fee_bps, seeker_fee_bps }) })
const down = (chain_id: string, message = 'rpc down') => ({ chain_id, getFees: async () => { throw new Error(message) } })

test('a valid pair: whole bps, seeker <= fee <= the contracts\' maximum', () => {
  assert.equal(feePairProblem(250, 100), null)
  assert.equal(feePairProblem(0, 0), null)
  assert.equal(feePairProblem(ESCROW_LIMITS.maxPlatformFeeBps, ESCROW_LIMITS.maxPlatformFeeBps), null)
  assert.equal(feePairProblem(100, 100), null, 'seeker equal to the fee is allowed')
})

test('each way a pair is invalid is refused, with its own reason', () => {
  assert.match(feePairProblem(2.5, 1) ?? '', /whole basis points/)
  assert.match(feePairProblem(250, 1.5) ?? '', /whole basis points/)
  assert.match(feePairProblem(-1, 0) ?? '', /negative/)
  assert.match(feePairProblem(250, -1) ?? '', /negative/)
  assert.match(feePairProblem(ESCROW_LIMITS.maxPlatformFeeBps + 1, 0) ?? '', /exceeds the contracts' maximum/)
  assert.match(feePairProblem(100, 101) ?? '', /must not exceed the standard fee/)
})

test('readChainFees keeps one chain\'s failure from costing the others, and says why', async () => {
  const reads = await readChainFees([ok('a', 250, 100), down('b', 'ECONNRESET'), ok('c', 300, 100)])
  assert.deepEqual(reads, [
    { chain_id: 'a', fees: { fee_bps: 250, seeker_fee_bps: 100 } },
    { chain_id: 'b', fees: null, error: 'ECONNRESET' },
    { chain_id: 'c', fees: { fee_bps: 300, seeker_fee_bps: 100 } },
  ])
})

test('readChainFees reports a non-Error rejection as text, never as [object Object]', async () => {
  const [read] = await readChainFees([{ chain_id: 'x', getFees: () => Promise.reject('plain string') }])
  assert.deepEqual(read, { chain_id: 'x', fees: null, error: 'plain string' })
})

test('compareFees: agree, mismatch (either number), and an unreadable chain is UNKNOWN, never a mismatch', async () => {
  const reads = await readChainFees([ok('agree', 250, 100), ok('fee-differs', 300, 100), ok('seeker-differs', 250, 50), down('unreadable')])
  const result = compareFees(CONFIGURED, reads)
  assert.deepEqual(result.agreeing, ['agree'])
  assert.deepEqual(result.mismatched.map((m) => m.chain_id), ['fee-differs', 'seeker-differs'])
  assert.deepEqual(result.mismatched[0], { chain_id: 'fee-differs', on_chain: { fee_bps: 300, seeker_fee_bps: 100 }, configured: CONFIGURED })
  assert.deepEqual(result.unknown, [{ chain_id: 'unreadable', error: 'rpc down' }])
})

test('with nothing to read, nothing disagrees', () => {
  assert.deepEqual(compareFees(CONFIGURED, []), { mismatched: [], unknown: [], agreeing: [] })
})

test('describeComparison writes one line per finding, mismatches first', async () => {
  const lines = describeComparison(compareFees(CONFIGURED, await readChainFees([ok('good', 250, 100), ok('bad', 300, 100), down('dark')])))
  assert.equal(lines.length, 3)
  assert.match(lines[0], /^MISMATCH bad: contract charges 300\/100 bps .* platform_config says 250\/100/)
  assert.match(lines[1], /^UNKNOWN {2}dark: could not be read \(rpc down\)/)
  assert.equal(lines[2], 'ok       good')
})

test('a getFees that throws SYNCHRONOUSLY is still just that chain being unreadable', async () => {
  const sync = { chain_id: 'sync', getFees: (): Promise<never> => { throw new Error('thrown before a promise existed') } }
  const reads = await readChainFees([ok('a', 250, 100), sync])
  assert.deepEqual(reads, [{ chain_id: 'a', fees: { fee_bps: 250, seeker_fee_bps: 100 } }, { chain_id: 'sync', fees: null, error: 'thrown before a promise existed' }])
})

test('feeCheckExitCode: 0 all agree, 1 on a mismatch, 2 when only unreadable — a mismatch outranks unreadable', () => {
  const configured = { fee_bps: 250, seeker_fee_bps: 100 }
  const agree = { chain_id: 'a', fees: { fee_bps: 250, seeker_fee_bps: 100 } }
  const differs = { chain_id: 'b', fees: { fee_bps: 300, seeker_fee_bps: 100 } }
  const unreadable = { chain_id: 'c', fees: null, error: 'rpc down' }
  assert.equal(feeCheckExitCode(compareFees(configured, [agree])), 0)
  assert.equal(feeCheckExitCode(compareFees(configured, [])), 0)
  assert.equal(feeCheckExitCode(compareFees(configured, [agree, differs])), 1)
  assert.equal(feeCheckExitCode(compareFees(configured, [agree, unreadable])), 2)
  assert.equal(feeCheckExitCode(compareFees(configured, [differs, unreadable])), 1)
})
