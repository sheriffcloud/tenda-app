/**
 * `fee:set`'s decisions, without a database: which arguments are refused, what is left
 * to do per chain, and the exact call a multisig must make.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeFunctionData } from 'viem'
import { ESCROW_EVM_ABI } from '@server/chains/evm/rpc'
import { feeSetArgsProblem, planFeeSet, setFeeBpsCalldata } from '@server/features/platform-fees/fee-set'
import { readChainFees } from '@server/features/platform-fees/fees'

const TARGET = { fee_bps: 300, seeker_fee_bps: 120 }
const chain = (chain_id: string, fee_bps: number, seeker_fee_bps: number) => ({ chain_id, getFees: async () => ({ fee_bps, seeker_fee_bps }) })

test('arguments: two whole numbers forming a valid pair, nothing else', () => {
  assert.deepEqual(feeSetArgsProblem(['300', '120']), { target: TARGET })
  assert.deepEqual(feeSetArgsProblem(['0', '0']), { target: { fee_bps: 0, seeker_fee_bps: 0 } })
})

test('each way the arguments are wrong is refused before any chain is touched', () => {
  assert.match((feeSetArgsProblem([]) as { problem: string }).problem, /usage/)
  assert.match((feeSetArgsProblem(['300']) as { problem: string }).problem, /usage/)
  assert.match((feeSetArgsProblem(['300', '120', '1']) as { problem: string }).problem, /usage/)
  assert.match((feeSetArgsProblem(['3.5', '1']) as { problem: string }).problem, /whole numbers/)
  assert.match((feeSetArgsProblem(['-5', '1']) as { problem: string }).problem, /whole numbers/)
  assert.match((feeSetArgsProblem(['abc', '1']) as { problem: string }).problem, /whole numbers/)
  assert.match((feeSetArgsProblem(['100', '200']) as { problem: string }).problem, /must not exceed the standard fee/)
  assert.match((feeSetArgsProblem(['5000', '1']) as { problem: string }).problem, /exceeds the contracts' maximum/)
})

test('plan: ready only when EVERY chain was read and charges the target', async () => {
  const plan = planFeeSet(TARGET, await readChainFees([chain('a', 300, 120), chain('b', 300, 120)]))
  assert.equal(plan.ready_to_write, true)
  assert.deepEqual(plan.chains.map((c) => c.state), ['at_target', 'at_target'])
})

test('plan: one chain still on the old fees blocks the write, and says what it charges now', async () => {
  const plan = planFeeSet(TARGET, await readChainFees([chain('done', 300, 120), chain('pending', 250, 100)]))
  assert.equal(plan.ready_to_write, false)
  assert.deepEqual(plan.chains, [
    { chain_id: 'done', state: 'at_target' },
    { chain_id: 'pending', state: 'needs_change', current: { fee_bps: 250, seeker_fee_bps: 100 } },
  ])
})

test('plan: a chain whose seeker fee alone differs still needs a change', async () => {
  const plan = planFeeSet(TARGET, await readChainFees([chain('a', 300, 100)]))
  assert.equal(plan.chains[0].state, 'needs_change')
})

test('plan: an UNREADABLE chain blocks the write: it cannot be confirmed', async () => {
  const dark = { chain_id: 'dark', getFees: async () => { throw new Error('rpc down') } }
  const plan = planFeeSet(TARGET, await readChainFees([chain('done', 300, 120), dark]))
  assert.equal(plan.ready_to_write, false)
  assert.deepEqual(plan.chains[1], { chain_id: 'dark', state: 'unreadable', error: 'rpc down' })
})

test('plan: with no chains configured there is nothing to confirm and nothing that blocks (the DB is the only copy)', () => {
  assert.equal(planFeeSet(TARGET, []).ready_to_write, true)
})

test('the multisig call is setFeeBps(fee, seeker), decoded back from its own calldata', () => {
  const decoded = decodeFunctionData({ abi: ESCROW_EVM_ABI, data: setFeeBpsCalldata(TARGET) })
  assert.equal(decoded.functionName, 'setFeeBps')
  assert.deepEqual(decoded.args, [300, 120])
})
