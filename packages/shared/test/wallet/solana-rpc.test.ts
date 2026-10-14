/**
 * wallet/solana-rpc — the resilient broadcast/status transport (per-endpoint
 * retry, failover, lost-response recovery, signature-match assertion) and its
 * conservative error classifier. Connections are fake `SolanaConnectionPort`s
 * via the injected factory — the whole point of the zero-dep move.
 */
import { test, mock } from 'node:test'
import assert from 'node:assert'
import {
  createSolanaRpcTransport,
  classifySolanaRpcError,
  isRetryableSolanaRpcError,
  type SolanaConnectionPort,
} from '../../src/wallet/solana-rpc'

const raw = new Uint8Array([1, 2, 3])
const signature = 'signed-reference'

type StatusValue = { err: unknown | null; confirmationStatus?: string | null } | null

/** A fake ConnectionPort recording calls; behavior injected per test. */
function connection(overrides: Partial<{
  send: (raw: Uint8Array) => Promise<string>
  status: (sig: string) => Promise<{ value: StatusValue }>
}> = {}) {
  const sendCalls: Uint8Array[] = []
  const statusCalls: string[] = []
  const port: SolanaConnectionPort = {
    sendRawTransaction: (r) => {
      sendCalls.push(r)
      return (overrides.send ?? (async () => signature))(r)
    },
    getSignatureStatus: (s) => {
      statusCalls.push(s)
      return (overrides.status ?? (async () => ({ value: null as StatusValue })))(s)
    },
  }
  return { port, sendCalls, statusCalls }
}

function transportOf(primary: SolanaConnectionPort, fallback?: SolanaConnectionPort) {
  const endpoints = fallback === undefined ? ['primary'] : ['primary', 'fallback']
  return createSolanaRpcTransport(endpoints, (url) =>
    url === 'primary' ? primary : (fallback as SolanaConnectionPort),
  )
}

test('an empty endpoint list is refused at construction', () => {
  assert.throws(() => createSolanaRpcTransport([], () => connection().port), /at least one/)
})

test('broadcast returns primary success without touching fallback', async () => {
  const primary = connection()
  const fallback = connection()
  const transport = transportOf(primary.port, fallback.port)
  assert.strictEqual(await transport.broadcast(raw, signature), signature)
  assert.deepStrictEqual(primary.sendCalls, [raw])
  assert.strictEqual(fallback.sendCalls.length, 0)
})

test('transport failure retries identical bytes then fails over', async () => {
  const primary = connection({ send: async () => { throw new TypeError('Network request failed') } })
  const fallback = connection()
  const transport = transportOf(primary.port, fallback.port)
  assert.strictEqual(await transport.broadcast(raw, signature), signature)
  assert.strictEqual(primary.sendCalls.length, 2)
  assert.strictEqual(primary.sendCalls[0], raw)
  assert.strictEqual(primary.sendCalls[1], raw)
  assert.deepStrictEqual(fallback.sendCalls, [raw])
})

test('lost response recovers from status without a duplicate fallback send', async () => {
  const primary = connection({
    send: async () => { throw new TypeError('Network request failed') },
    status: async () => ({ value: { err: null, confirmationStatus: 'confirmed' } }),
  })
  const fallback = connection()
  const transport = transportOf(primary.port, fallback.port)
  assert.strictEqual(await transport.broadcast(raw, signature), signature)
  assert.deepStrictEqual(primary.statusCalls, [signature])
  assert.strictEqual(fallback.sendCalls.length, 0)
})

test('an already-processed response returns the locally derived signature without replay', async () => {
  const primary = connection({
    send: async () => { throw new Error('This transaction has already been processed') },
  })
  const fallback = connection()
  const transport = transportOf(primary.port, fallback.port)
  assert.strictEqual(await transport.broadcast(raw, signature), signature)
  assert.strictEqual(primary.sendCalls.length, 1)
  assert.strictEqual(fallback.sendCalls.length, 0)
})

test('deterministic rejection is never retried or failed over', async () => {
  // The word "connection" used to win before the deterministic classifier and
  // incorrectly replay this program rejection.
  const rejection = new Error('Transaction simulation failed: connection constraint violated')
  const primary = connection({ send: async () => { throw rejection } })
  const fallback = connection()
  const transport = transportOf(primary.port, fallback.port)
  await assert.rejects(transport.broadcast(raw, signature), (e) => e === rejection)
  assert.strictEqual(primary.sendCalls.length, 1)
  assert.strictEqual(fallback.sendCalls.length, 0)
})

test('broadcast falls through when recovery status lookup also has a transport failure', async () => {
  const primary = connection({
    send: async () => { throw new TypeError('Network request failed') },
    status: async () => { throw new TypeError('status fetch failed') },
  })
  const fallback = connection()
  const transport = transportOf(primary.port, fallback.port)
  assert.strictEqual(await transport.broadcast(raw, signature), signature)
  assert.deepStrictEqual(primary.statusCalls, [signature])
  assert.deepStrictEqual(fallback.sendCalls, [raw])
})

test('a hung primary is bounded before retry and fallback', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const primary = connection({
      send: () => new Promise<string>(() => {}),
      status: () => new Promise(() => {}),
    })
    const fallback = connection()
    const transport = transportOf(primary.port, fallback.port)

    const pending = transport.broadcast(raw, signature)
    let settled = false
    void pending.then(() => { settled = true }, () => { settled = true })
    // Drain: every bound (withTimeout) and retry delay is a setTimeout —
    // alternate large ticks with microtask yields until the flow settles.
    for (let i = 0; i < 50 && !settled; i++) {
      mock.timers.tick(60_000)
      for (let j = 0; j < 10; j++) await Promise.resolve()
    }
    assert.strictEqual(await pending, signature)
    assert.strictEqual(primary.sendCalls.length, 2)
    assert.strictEqual(fallback.sendCalls.length, 1)
  } finally {
    mock.timers.reset()
  }
})

test('a mismatched RPC signature is rejected and never reported as this transaction', async () => {
  const primary = connection({ send: async () => 'different-signature' })
  const transport = transportOf(primary.port)
  await assert.rejects(transport.broadcast(raw, signature), /does not match/)
  assert.strictEqual(primary.sendCalls.length, 1)
})

test('status reads fail over and preserve failed status', async () => {
  const primary = connection({ status: async () => { throw new TypeError('fetch failed') } })
  const fallback = connection({ status: async () => ({ value: { err: { code: 1 } } }) })
  const transport = transportOf(primary.port, fallback.port)
  assert.strictEqual(await transport.getTransactionStatus(signature), 'failed')
})

test('status reads fail over after an unclassified provider error', async () => {
  const primary = connection({ status: async () => { throw new Error('malformed provider envelope') } })
  const fallback = connection({
    status: async () => ({ value: { err: null, confirmationStatus: 'confirmed' } }),
  })
  const transport = transportOf(primary.port, fallback.port)
  assert.strictEqual(await transport.getTransactionStatus(signature), 'confirmed')
  assert.deepStrictEqual(fallback.statusCalls, [signature])
})

test('status reads continue when a responsive primary has not seen the signature yet', async () => {
  const primary = connection({ status: async () => ({ value: null }) })
  const fallback = connection({
    status: async () => ({ value: { err: null, confirmationStatus: 'finalized' } }),
  })
  const transport = transportOf(primary.port, fallback.port)
  assert.strictEqual(await transport.getTransactionStatus(signature), 'finalized')
  assert.deepStrictEqual(fallback.statusCalls, [signature])
})

test('a valid pending response wins over a secondary provider outage', async () => {
  const primary = connection({ status: async () => ({ value: null }) })
  const fallback = connection({ status: async () => { throw new Error('provider unavailable') } })
  const transport = transportOf(primary.port, fallback.port)
  assert.strictEqual(await transport.getTransactionStatus(signature), 'not_found')
})

test('status lookup surfaces the final endpoint error when every endpoint fails', async () => {
  const primaryError = new TypeError('primary fetch failed')
  const fallbackError = new TypeError('fallback fetch failed')
  const primary = connection({ status: async () => { throw primaryError } })
  const fallback = connection({ status: async () => { throw fallbackError } })
  const transport = transportOf(primary.port, fallback.port)
  await assert.rejects(transport.getTransactionStatus(signature), (e) => e === fallbackError)
})

test('a processed signature remains pending until confirmed', async () => {
  const pending = connection({
    status: async () => ({ value: { err: null, confirmationStatus: 'processed' } }),
  })
  const transport = transportOf(pending.port)
  assert.strictEqual(await transport.getTransactionStatus(signature), 'not_found')
})

// ---------- error classifier ----------

test('classifySolanaRpcError buckets each failure shape', () => {
  const cases: [unknown, string][] = [
    [new TypeError('Network request failed'), 'transport'],
    [new Error('RPC timeout'), 'timeout'],
    [new Error('429 rate limited'), 'rate_limited'],
    [new Error('503 Service Unavailable'), 'transport'],
    [new Error('This transaction has already been processed'), 'already_processed'],
    [new Error('Transaction simulation failed'), 'deterministic'],
    [new Error('Transaction simulation failed: connection constraint violated'), 'deterministic'],
    [new Error('unexpected response'), 'unknown'],
  ]
  for (const [error, expected] of cases) {
    assert.strictEqual(classifySolanaRpcError(error), expected, String(error))
  }
})

test('only ambiguous transport failures are automatically retryable', () => {
  assert.strictEqual(isRetryableSolanaRpcError(new Error('socket closed')), true)
  assert.strictEqual(isRetryableSolanaRpcError(new Error('blockhash not found')), false)
  assert.strictEqual(isRetryableSolanaRpcError(new Error('already processed')), false)
  assert.strictEqual(isRetryableSolanaRpcError(new Error('already been processed')), false)
  assert.strictEqual(isRetryableSolanaRpcError(new Error('unexpected response')), false)
})
