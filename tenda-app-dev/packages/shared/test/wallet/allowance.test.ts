/**
 * wallet/allowance, pure encoders, the allowance read, and the
 * ensureAllowance composition (skip-if-sufficient / approve-then-wait /
 * revert-and-timeout failure modes). RPC rides a stubbed global fetch (same
 * pattern as the balances reader tests); the approve tx rides the injected
 * `sendTx` seam — the zero-dep move's whole point, so these tests double as
 * proof no wallet SDK is reachable from here.
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import {
  displayToAmountRaw,
  encodeApprove,
  ensureAllowance,
  readAllowance,
  waitForReceipt,
  type SendEvmTx,
} from '../../src/wallet/allowance'

const CHAIN = 'eip155:84532' // manifest publicRpcUrl exists for this id
const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const OWNER = '0xAbC0000000000000000000000000000000000001'
const SPENDER = '0xDef0000000000000000000000000000000000002'

/** FIFO fetch stub: each entry answers one RPC call (or rejects). */
type FetchCall = { url: string; body: string }
let fetchQueue: Array<{ result?: unknown; raw?: unknown; reject?: Error }> = []
let fetchCalls: FetchCall[] = []
/** When the queue runs dry, every further call answers with this. */
let fetchDefault: { result?: unknown; raw?: unknown; reject?: Error } | null = null

const realFetch = globalThis.fetch

function stubFetch(): void {
  globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
    fetchCalls.push({ url: String(url), body: String(init?.body ?? '') })
    const next = fetchQueue.shift() ?? fetchDefault
    if (next === undefined || next === null) throw new Error('fetch stub exhausted')
    if (next.reject !== undefined) throw next.reject
    const payload = next.raw ?? { jsonrpc: '2.0', id: 1, result: next.result }
    return { json: async () => payload }
  }) as typeof fetch
}

/** Records sendTx invocations; resolves with a fixed hash. */
function makeSendTx(): { sendTx: SendEvmTx; calls: Parameters<SendEvmTx>[0][] } {
  const calls: Parameters<SendEvmTx>[0][] = []
  const sendTx: SendEvmTx = async (input) => {
    calls.push(input)
    return '0xApproveTx'
  }
  return { sendTx, calls }
}

beforeEach(() => {
  fetchQueue = []
  fetchCalls = []
  fetchDefault = null
  stubFetch()
})

afterEach(() => {
  globalThis.fetch = realFetch
})

// ---------- pure encoders ----------

test('encodeApprove: selector + padded spender + padded amount', () => {
  const data = encodeApprove(SPENDER, '1000000')
  assert.strictEqual(
    data,
    '0x095ea7b3' +
      'def0000000000000000000000000000000000002'.padStart(64, '0') +
      (1_000_000).toString(16).padStart(64, '0'),
  )
})

test('displayToAmountRaw: decimal strings → base units; junk → null', () => {
  assert.strictEqual(displayToAmountRaw('12.5', 6), '12500000')
  assert.strictEqual(displayToAmountRaw('0', 6), '0')
  assert.strictEqual(displayToAmountRaw('45', 6), '45000000')
  assert.strictEqual(displayToAmountRaw('0.000001', 6), '1')
  assert.strictEqual(displayToAmountRaw('0.0000001', 6), null) // beyond precision
  assert.strictEqual(displayToAmountRaw('12.', 6), null)
  assert.strictEqual(displayToAmountRaw('-5', 6), null)
  assert.strictEqual(displayToAmountRaw('abc', 6), null)
  assert.strictEqual(displayToAmountRaw('', 6), null)
})

test('displayToAmountRaw: caps at uint256 (padStart cannot truncate the excess)', () => {
  const maxUint256 = 2n ** 256n - 1n
  assert.strictEqual(displayToAmountRaw(maxUint256.toString(), 0), maxUint256.toString())
  assert.strictEqual(displayToAmountRaw((maxUint256 + 1n).toString(), 0), null)
  assert.strictEqual(displayToAmountRaw(maxUint256.toString(), 6), null) // ×10^6 overflows
})

test('encodeApprove: an over-uint256 amount throws instead of emitting malformed calldata', () => {
  assert.throws(() => encodeApprove(SPENDER, (2n ** 256n).toString()), RangeError)
})

// ---------- readAllowance ----------

test('readAllowance eth_calls allowance(owner, spender) and decodes the hex quantity', async () => {
  fetchQueue.push({ result: `0x${(5_000_000).toString(16)}` })
  const allowance = await readAllowance({ chainId: CHAIN, token: TOKEN, owner: OWNER, spender: SPENDER })
  assert.strictEqual(allowance, '5000000')
  const body = JSON.parse(fetchCalls[0].body) as {
    method: string
    params: [{ to: string; data: string }, string]
  }
  assert.strictEqual(body.method, 'eth_call')
  assert.strictEqual(body.params[0].to, TOKEN)
  assert.ok(body.params[0].data.startsWith('0xdd62ed3e'))
})

test('a dead RPC propagates (callers surface it, never fake a zero allowance)', async () => {
  fetchQueue.push({ reject: new Error('rpc down') })
  await assert.rejects(
    readAllowance({ chainId: CHAIN, token: TOKEN, owner: OWNER, spender: SPENDER }),
    /rpc down/,
  )
})

test('a JSON-RPC error object throws too, an unreadable allowance is never zero', async () => {
  fetchQueue.push({ raw: { jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'execution reverted' } } })
  await assert.rejects(
    readAllowance({ chainId: CHAIN, token: TOKEN, owner: OWNER, spender: SPENDER }),
    /Could not read the current allowance/,
  )
})

test('an empty eth_call return (0x, no contract code) throws, not zero', async () => {
  fetchQueue.push({ result: '0x' })
  await assert.rejects(
    readAllowance({ chainId: CHAIN, token: TOKEN, owner: OWNER, spender: SPENDER }),
    /Could not read the current allowance/,
  )
})

test('unknown chain (no public RPC) throws the typed wallet error', async () => {
  await assert.rejects(
    readAllowance({ chainId: 'eip155:1', token: TOKEN, owner: OWNER, spender: SPENDER }),
    /No public RPC/,
  )
})

// ---------- ensureAllowance ----------

test('sufficient standing allowance → no wallet round-trip', async () => {
  fetchQueue.push({ result: `0x${(2_000_000).toString(16)}` })
  const { sendTx, calls } = makeSendTx()
  const result = await ensureAllowance({
    chainId: CHAIN,
    token: TOKEN,
    spender: SPENDER,
    amountRaw: '1000000',
    owner: OWNER,
    sendTx,
  })
  assert.strictEqual(result, 'sufficient')
  assert.strictEqual(calls.length, 0)
})

test('short allowance → approve via the injected sender, then wait for the receipt', async () => {
  fetchQueue.push({ result: '0x0' }) // allowance read
  fetchQueue.push({ result: { status: '0x1' } }) // receipt
  const { sendTx, calls } = makeSendTx()
  const result = await ensureAllowance({
    chainId: CHAIN,
    token: TOKEN,
    spender: SPENDER,
    amountRaw: '1000000',
    owner: OWNER,
    sendTx,
  })
  assert.strictEqual(result, 'approved')
  assert.deepStrictEqual(calls, [
    {
      from: OWNER,
      to: TOKEN,
      data: encodeApprove(SPENDER, '1000000'),
      value: '0',
      chainId: CHAIN,
    },
  ])
})

test('a reverted approve tx throws (the escrow tx must never follow)', async () => {
  fetchQueue.push({ result: '0x0' })
  fetchQueue.push({ result: { status: '0x0' } })
  const { sendTx } = makeSendTx()
  await assert.rejects(
    ensureAllowance({
      chainId: CHAIN,
      token: TOKEN,
      spender: SPENDER,
      amountRaw: '1',
      owner: OWNER,
      sendTx,
      intervalMs: 1,
      timeoutMs: 100,
    }),
    /reverted/,
  )
})

test('a timed-out receipt re-checks the allowance before failing', async () => {
  fetchQueue.push({ result: '0x0' }) // pre-check
  fetchQueue.push({ result: null }) // receipt: still pending
  fetchQueue.push({ result: `0x${(1_000_000).toString(16)}` }) // post-check: landed
  const { sendTx } = makeSendTx()
  const result = await ensureAllowance({
    chainId: CHAIN,
    token: TOKEN,
    spender: SPENDER,
    amountRaw: '1000000',
    owner: OWNER,
    sendTx,
    intervalMs: 1,
    timeoutMs: 0, // force the timeout branch → post-check saves it
  })
  assert.strictEqual(result, 'approved')
})

test('timeout with the allowance still short throws the retry error', async () => {
  fetchQueue.push({ result: '0x0' }) // pre-check
  fetchQueue.push({ result: null }) // receipt: pending
  fetchQueue.push({ result: '0x0' }) // post-check: still short
  const { sendTx } = makeSendTx()
  await assert.rejects(
    ensureAllowance({
      chainId: CHAIN,
      token: TOKEN,
      spender: SPENDER,
      amountRaw: '1000000',
      owner: OWNER,
      sendTx,
      intervalMs: 1,
      timeoutMs: 0,
    }),
    /taking too long/,
  )
})

// ---------- waitForReceipt ----------

test('waitForReceipt polls until mined; reports revert and timeout distinctly', async () => {
  fetchQueue.push({ result: null })
  fetchQueue.push({ result: { status: '0x1' } })
  const confirmed = await waitForReceipt({ chainId: CHAIN, txHash: '0xA', intervalMs: 1, timeoutMs: 5_000 })
  assert.strictEqual(confirmed, 'confirmed')

  fetchDefault = { result: { status: '0x0' } }
  assert.strictEqual(await waitForReceipt({ chainId: CHAIN, txHash: '0xB', intervalMs: 1 }), 'reverted')

  fetchDefault = { result: null }
  assert.strictEqual(
    await waitForReceipt({ chainId: CHAIN, txHash: '0xC', intervalMs: 1, timeoutMs: 5 }),
    'timeout',
  )
})
