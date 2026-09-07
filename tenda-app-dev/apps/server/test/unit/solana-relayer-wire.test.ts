/**
 * What `web3SolanaRelayer` puts ON THE WIRE, against a stub JSON-RPC node on a
 * real socket: the port test (solana-relayer-port.test.ts) proves the mapping
 * over a fake connection, so the one thing left unproven was the real
 * `Connection` call — in particular that preflight really carries
 * `sigVerify: true` (the documented "a bad creator signature is refused
 * before the relayer's signature leaves" property) and that the broadcast
 * pins the chain's commitment.
 */
import { after, before, test } from 'node:test'
import * as assert from 'node:assert'
import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import bs58 from 'bs58'
import { commitmentFor } from '@server/chains/solana/rpc'
import { web3SolanaRelayer } from '@server/chains/solana/relay/relayer'
import { startStubRpc, type StubRpc } from '../helpers/stub-rpc'

const CHAIN_ID = 'solana:devnet'
const keypair = Keypair.generate()
const BLOCKHASH = 'GfVcyD4kkTrj4bKc7WA9sZCin9JDbdT4Zkd3EuQH6Tx8'
const SIGNATURE = bs58.encode(new Uint8Array(64).fill(7))

let rpc: StubRpc
let delay_ms = 0

before(async () => {
  rpc = await startStubRpc(async (method) => {
    if (delay_ms > 0) await new Promise((r) => setTimeout(r, delay_ms))
    switch (method) {
      case 'getBalance': return { context: { slot: 1 }, value: 1_500_000 }
      case 'getMinimumBalanceForRentExemption': return 1_650
      case 'isBlockhashValid': return { context: { slot: 1 }, value: true }
      case 'simulateTransaction': return { context: { slot: 1 }, value: { err: null, logs: ['Program log: ok'], accounts: null, unitsConsumed: 0 } }
      case 'sendTransaction': return SIGNATURE
      default: return undefined
    }
  })
})
after(async () => { await rpc.close() })

function signedTx(): VersionedTransaction {
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: BLOCKHASH,
      instructions: [SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1n })],
    }).compileToV0Message(),
  )
  tx.sign([keypair])
  return tx
}

test('reads go out with the chain commitment and come back typed', async () => {
  const relayer = web3SolanaRelayer({ rpc_url: rpc.url, chain_id: CHAIN_ID, secret_key_base58: bs58.encode(keypair.secretKey) })
  assert.strictEqual(await relayer.getBalance(keypair.publicKey), 1_500_000n)
  assert.strictEqual(await relayer.minimumBalanceForRentExemption(165), 1_650n)
  assert.strictEqual(await relayer.isBlockhashValid(BLOCKHASH), true)
  const commitment = commitmentFor(CHAIN_ID)
  assert.deepStrictEqual(rpc.callsTo('getBalance')[0]?.params, [keypair.publicKey.toBase58(), { commitment }])
  // web3 applies the Connection's default commitment to this read too.
  assert.deepStrictEqual(rpc.callsTo('getMinimumBalanceForRentExemption')[0]?.params, [165, { commitment }])
  assert.deepStrictEqual(rpc.callsTo('isBlockhashValid')[0]?.params, [BLOCKHASH, { commitment }])
})

test('preflight simulates WITH signature verification, and the broadcast pins the preflight commitment', async () => {
  const relayer = web3SolanaRelayer({ rpc_url: rpc.url, chain_id: CHAIN_ID, secret_key_base58: bs58.encode(keypair.secretKey) })
  const tx = signedTx()
  assert.deepStrictEqual(await relayer.simulate(tx), { err: null, logs: ['Program log: ok'] })
  assert.strictEqual(await relayer.send(tx), SIGNATURE)
  const commitment = commitmentFor(CHAIN_ID)
  const encoded = Buffer.from(tx.serialize()).toString('base64')
  const [simulate] = rpc.callsTo('simulateTransaction')
  assert.deepStrictEqual(simulate?.params, [encoded, { sigVerify: true, commitment, encoding: 'base64' }])
  const [send] = rpc.callsTo('sendTransaction')
  assert.deepStrictEqual(send?.params, [encoded, { encoding: 'base64', preflightCommitment: commitment }])
})

test('a node that answers late is a timeout, not a hung request', { timeout: 5_000 }, async () => {
  const relayer = web3SolanaRelayer({ rpc_url: rpc.url, chain_id: CHAIN_ID, secret_key_base58: bs58.encode(keypair.secretKey), timeout_ms: 100 })
  delay_ms = 400
  try {
    await assert.rejects(relayer.getBalance(keypair.publicKey), /solana rpc timeout after 100ms: getBalance/)
  } finally {
    delay_ms = 0
  }
})
