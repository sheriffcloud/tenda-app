/**
 * One node's "no record" is not proof a seed transfer failed.
 *
 * `classifySolanaStatus` turns a null status into `failed` once the transfer is
 * older than the expiry margin, and `failed` RELEASES the claimed slot so the
 * user can be paid again. The status read used to take the first endpoint that
 * ANSWERED, so a primary that answers fast from a lagging node ("never heard of
 * it") released the slot for a transfer that had landed: a second payment, which
 * cannot be taken back.
 *
 * Past the margin a null now has to be corroborated: every configured endpoint
 * must answer null before it counts as proof. An endpoint that errors is not an
 * answer. Driven through the real sender over stub JSON-RPC nodes, so the number
 * of calls each node received is part of what is asserted.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import {
  SOLANA_SEED_EXPIRY_MS,
  solanaGasSeedSender,
  solanaGasSeedSenderFromPort,
  type SolanaGasSeedPort,
} from '@server/features/gas-seed/senders/solana'
import { startStubRpc, type StubRpc } from '../helpers/stub-rpc'

const SOL_KEY = bs58.encode(Keypair.generate().secretKey)
const TX_REF = bs58.encode(Buffer.alloc(64, 5))
const NO_RECORD = { context: { slot: 1 }, value: [null] }
const LANDED = { context: { slot: 1 }, value: [{ slot: 1, confirmations: null, err: null, confirmationStatus: 'finalized' }] }
const LANDED_FAILED = {
  context: { slot: 1 },
  value: [{ slot: 1, confirmations: null, err: { InstructionError: [0, 'Custom'] }, confirmationStatus: 'finalized' }],
}

const STATUS = 'getSignatureStatuses'
const old = () => new Date(Date.now() - SOLANA_SEED_EXPIRY_MS - 1_000)

function senderOver(primary: StubRpc, fallback: string | undefined) {
  return solanaGasSeedSender({
    rpc_url: primary.url,
    rpc_url_fallback: fallback,
    chain_id: 'solana:devnet',
    secret_key_base58: SOL_KEY,
  })
}

async function nodes(primaryAnswers: (m: string) => unknown, fallbackAnswers: (m: string) => unknown) {
  const primary = await startStubRpc(primaryAnswers)
  const fallback = await startStubRpc(fallbackAnswers)
  return { primary, fallback, close: async () => { await primary.close(); await fallback.close() } }
}

const says = (answer: unknown) => (m: string): unknown => (m === STATUS ? answer : null)
const refuses = (m: string): unknown => {
  if (m === STATUS) throw new Error('node is down')
  return null
}

test('past the margin, a primary that says "no record" does NOT release the slot when the fallback saw it land', async () => {
  const n = await nodes(says(NO_RECORD), says(LANDED))
  try {
    const status = await senderOver(n.primary, n.fallback.url).checkStatus({ tx_ref: TX_REF, submitted_at: old() })
    assert.strictEqual(status, 'delivered')
    assert.strictEqual(n.primary.callsTo(STATUS).length, 1, 'the primary is asked first')
    assert.strictEqual(n.fallback.callsTo(STATUS).length, 1, 'and the fallback corroborates')
  } finally {
    await n.close()
  }
})

test('past the margin, a transfer the fallback saw FAIL is failed on the chain\'s word, not on silence', async () => {
  const n = await nodes(says(NO_RECORD), says(LANDED_FAILED))
  try {
    assert.strictEqual(
      await senderOver(n.primary, n.fallback.url).checkStatus({ tx_ref: TX_REF, submitted_at: old() }),
      'failed',
    )
  } finally {
    await n.close()
  }
})

test('past the margin, both endpoints saying "no record" is the proof, and the slot is released', async () => {
  const n = await nodes(says(NO_RECORD), says(NO_RECORD))
  try {
    assert.strictEqual(
      await senderOver(n.primary, n.fallback.url).checkStatus({ tx_ref: TX_REF, submitted_at: old() }),
      'failed',
    )
    assert.strictEqual(n.fallback.callsTo(STATUS).length, 1, 'the fallback WAS asked before proof was claimed')
  } finally {
    await n.close()
  }
})

test('inside the margin a "no record" is just pending, and costs no second read', async () => {
  const n = await nodes(says(NO_RECORD), says(LANDED))
  try {
    assert.strictEqual(
      await senderOver(n.primary, n.fallback.url).checkStatus({ tx_ref: TX_REF, submitted_at: new Date() }),
      'pending',
    )
    assert.strictEqual(n.fallback.callsTo(STATUS).length, 0, 'the extra read is spent only where it can matter')
  } finally {
    await n.close()
  }
})

test('past the margin, an endpoint that ERRORS is not an answer: the read throws instead of calling it failed', async () => {
  // Primary: "no record". Fallback: down. One node's silence plus another's
  // outage is exactly the situation that must not release a slot; the confirm
  // job retries a throw, and a late answer costs minutes where an early one costs
  // a second payment.
  const n = await nodes(says(NO_RECORD), refuses)
  try {
    await assert.rejects(() =>
      senderOver(n.primary, n.fallback.url).checkStatus({ tx_ref: TX_REF, submitted_at: old() }),
    )
  } finally {
    await n.close()
  }
})

test('past the margin, a DOWN primary still lets a fallback that saw the landing win', async () => {
  const n = await nodes(refuses, says(LANDED))
  try {
    assert.strictEqual(
      await senderOver(n.primary, n.fallback.url).checkStatus({ tx_ref: TX_REF, submitted_at: old() }),
      'delivered',
    )
  } finally {
    await n.close()
  }
})

test('with no fallback configured the single endpoint\'s "no record" still ends the wait, as before', async () => {
  const node = await startStubRpc(says(NO_RECORD))
  try {
    assert.strictEqual(
      await senderOver(node, undefined).checkStatus({ tx_ref: TX_REF, submitted_at: old() }),
      'failed',
    )
    assert.strictEqual(node.callsTo(STATUS).length, 1)
  } finally {
    await node.close()
  }
})

test('the sender asks the port to corroborate exactly when the transfer is past the margin', async () => {
  const asked: boolean[] = []
  const port: SolanaGasSeedPort = {
    sign: () => Promise.resolve({ signature: 's', raw: new Uint8Array() }),
    send: () => Promise.resolve(),
    signatureStatus: (_sig, opts) => {
      asked.push(opts.corroborate)
      return Promise.resolve(null)
    },
  }
  const now = new Date()
  const sender = solanaGasSeedSenderFromPort(port, () => now)
  await sender.checkStatus({ tx_ref: TX_REF, submitted_at: new Date(now.getTime() - SOLANA_SEED_EXPIRY_MS) })
  await sender.checkStatus({ tx_ref: TX_REF, submitted_at: new Date(now.getTime() - SOLANA_SEED_EXPIRY_MS - 1) })
  assert.deepStrictEqual(asked, [false, true], 'the boundary is the classifier\'s own: strictly older than the margin')
})
