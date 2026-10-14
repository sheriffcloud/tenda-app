/**
 * The Solana relayer's connection adapter (chains/solana/relay/relayer):
 * the response → port mapping the litesvm and unit suites bypass by
 * implementing the port directly. Fake connection, real keypair.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import bs58 from 'bs58'
import { solanaRelayerFromConnection, web3SolanaRelayer, type SolanaRelayerConnectionPort } from '@server/chains/solana/relay/relayer'

const keypair = Keypair.generate()
const BLOCKHASH = 'GfVcyD4kkTrj4bKc7WA9sZCin9JDbdT4Zkd3EuQH6Tx8'

function unsignedTx(): VersionedTransaction {
  return new VersionedTransaction(
    new TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: BLOCKHASH,
      instructions: [SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1n })],
    }).compileToV0Message(),
  )
}

function fakeConnection(overrides: Partial<SolanaRelayerConnectionPort> = {}) {
  const sent: Uint8Array[] = []
  const conn: SolanaRelayerConnectionPort & { sent: Uint8Array[] } = {
    sent,
    async getBalance() { return 1_500_000 },
    async getMinimumBalanceForRentExemption(bytes) { return bytes * 10 },
    async isBlockhashValid(blockhash) { return { value: blockhash === BLOCKHASH } },
    async simulateTransaction() { return { value: { err: null, logs: ['Program log: ok'] } } },
    async sendRawTransaction(raw) { sent.push(raw); return 'Sig111' },
    ...overrides,
  }
  return conn
}

test('reads map number → bigint and unwrap the rpc `value` envelope', async () => {
  const relayer = solanaRelayerFromConnection(fakeConnection(), keypair)
  assert.ok(relayer.public_key.equals(keypair.publicKey))
  assert.strictEqual(await relayer.getBalance(keypair.publicKey), 1_500_000n)
  assert.strictEqual(await relayer.minimumBalanceForRentExemption(165), 1_650n)
  assert.strictEqual(await relayer.isBlockhashValid(BLOCKHASH), true)
  assert.strictEqual(await relayer.isBlockhashValid('other'), false)
})

test('simulate renders a runtime error as a string and null logs as an empty list', async () => {
  const ok = solanaRelayerFromConnection(fakeConnection(), keypair)
  assert.deepStrictEqual(await ok.simulate(unsignedTx()), { err: null, logs: ['Program log: ok'] })
  const failing = solanaRelayerFromConnection(
    fakeConnection({ async simulateTransaction() { return { value: { err: { InstructionError: [1, { Custom: 6006 }] }, logs: null } } } }),
    keypair,
  )
  assert.deepStrictEqual(await failing.simulate(unsignedTx()), { err: '{"InstructionError":[1,{"Custom":6006}]}', logs: [] })
})

test('every call runs under the per-call budget — a hung connection is a timeout, not a hang', { timeout: 2_000 }, async () => {
  const hung = fakeConnection({ getBalance: () => new Promise(() => {}) })
  const relayer = solanaRelayerFromConnection(hung, keypair, 20)
  await assert.rejects(relayer.getBalance(keypair.publicKey), /solana rpc timeout after 20ms: getBalance/)
})

test('sign adds the keypair signature in place and send broadcasts exactly the serialized bytes', async () => {
  const conn = fakeConnection()
  const relayer = solanaRelayerFromConnection(conn, keypair)
  const tx = unsignedTx()
  assert.ok(tx.signatures[0]!.every((b) => b === 0), 'unsigned before')
  relayer.sign(tx)
  assert.ok(!tx.signatures[0]!.every((b) => b === 0), 'signed after')
  assert.strictEqual(await relayer.send(tx), 'Sig111')
  assert.ok(Buffer.from(conn.sent[0]!).equals(Buffer.from(tx.serialize())))
})

test('web3SolanaRelayer derives the hot wallet from the base58 secret and refuses a malformed one', () => {
  const relayer = web3SolanaRelayer({
    rpc_url: 'http://127.0.0.1:8899',
    // Key derivation is this test's subject; failover is covered in
    // gas-seed-rpc-fallback.test.ts.
    rpc_url_fallback: undefined,
    chain_id: 'solana:devnet',
    secret_key_base58: bs58.encode(keypair.secretKey),
  })
  assert.ok(relayer.public_key.equals(keypair.publicKey))
  assert.throws(() => web3SolanaRelayer({
      rpc_url: 'http://127.0.0.1:8899',
      rpc_url_fallback: undefined,
      chain_id: 'solana:devnet',
      secret_key_base58: bs58.encode(keypair.publicKey.toBytes()),
    }))
})
