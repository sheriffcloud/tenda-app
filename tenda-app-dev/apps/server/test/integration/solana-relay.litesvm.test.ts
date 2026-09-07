/**
 * Relayed funding (#18) on Solana against the REAL program bytes: an agent
 * holding USDC and ZERO SOL partial-signs the server-quoted create
 * transaction, the relayer (fee payer) fronts exactly the rent shortfall,
 * co-signs and sends — and the escrow exists on-chain with the agent as
 * creator. The program is untouched; this is the fee-payer separation the
 * task counted on, proven rather than assumed.
 */
import { before, test } from 'node:test'
import * as assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { Keypair, PublicKey, SystemProgram, VersionedTransaction } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { solanaAdapter } from '@server/chains/solana'
import { decodeEscrowAccount, escrowPdaFromUuid, tokenVaultPda, vaultPda } from '@server/chains/solana/pdas'
import { uuidToBytes } from '@server/chains/ids'
import { AppError } from '@server/lib/errors'
import type { CreateEscrowPayload, RelayedCreateArgs } from '@server/chains/types'
import { TENDA_RELAY_SCHEME, X402_VERSION, type RelayPaymentPayload, type RelayTerms } from '@tenda/shared'
import { litesvmRelayer, litesvmRpc, litesvmSkip, startLiteSvm, type LiteSvmFixture } from '../helpers/litesvm'
import { TEST_PROGRAM } from '../helpers/solana'

const skip = litesvmSkip
const CHAIN_ID = 'solana:devnet'
const AMOUNT = 25_000_000n

const agent = Keypair.generate() // never airdropped: zero SOL throughout
const relayerKp = Keypair.generate()

let fx: LiteSvmFixture
let usdc: PublicKey
let adapter: ReturnType<typeof solanaAdapter>

before(async () => {
  if (skip) return
  fx = await startLiteSvm()
  fx.svm.airdrop(relayerKp.publicKey, 5_000_000_000n)
  usdc = fx.mint([{ owner: agent.publicKey, amount: 100_000_000n }])
  adapter = solanaAdapter({
    chain_id: CHAIN_ID,
    rpc_url: 'http://127.0.0.1:8899',
    deps: {
      resolveWalletAddress: async () => agent.publicKey.toBase58(),
      resolveAsset: async (asset) => (asset === 'SOL_DEVNET' ? { token_address: null } : { token_address: usdc.toBase58() }),
      rpc: litesvmRpc(fx.svm),
      relayer: litesvmRelayer(fx.svm, relayerKp),
    },
  })
})

function payload(escrow_id: string, overrides: Partial<CreateEscrowPayload> = {}): CreateEscrowPayload {
  return {
    escrow_id,
    kind: 'gig',
    asset: 'USDC_SOL',
    amount_raw: AMOUNT.toString(),
    accept_deadline_unix: Number(fx.svm.getClock().unixTimestamp) + 3_600,
    completion_duration_seconds: 7_200,
    dispute_bond_raw: '0',
    is_seeker: false,
    requires_approval: false,
    unassign_window_seconds: 0,
    ...overrides,
  }
}
const args = (p: CreateEscrowPayload): RelayedCreateArgs => ({ user_id: 'agent', creator_address: agent.publicKey.toBase58(), payload: p })

/** What the agent does with the terms: one ed25519 signature over the quoted transaction. */
function signTerms(terms: RelayTerms): RelayPaymentPayload {
  if (terms.payment.kind !== 'solana-transaction') throw new Error('unexpected terms')
  const tx = VersionedTransaction.deserialize(Buffer.from(terms.payment.transaction, 'base64'))
  tx.sign([agent])
  return { x402Version: X402_VERSION, scheme: TENDA_RELAY_SCHEME, network: CHAIN_ID, payload: { transaction: Buffer.from(tx.serialize()).toString('base64') } }
}

const tokenBalance = (ata: PublicKey): bigint => {
  const info = fx.svm.getAccount(ata)
  return info === null ? 0n : Buffer.from(info.data).readBigUInt64LE(64)
}

test('SPL: an agent with USDC and no SOL funds an escrow — relayer fronts exactly the rent, agent ends at zero', { skip }, async () => {
  const escrow_id = randomUUID()
  assert.ok(adapter.relay)
  assert.strictEqual(fx.svm.getBalance(agent.publicKey) ?? 0n, 0n)
  const relayerBefore = fx.svm.getBalance(relayerKp.publicKey) ?? 0n
  const agentAta = getAssociatedTokenAddressSync(usdc, agent.publicKey)
  const usdcBefore = tokenBalance(agentAta)

  const terms = await adapter.relay.quote(args(payload(escrow_id)))
  if (terms.payment.kind !== 'solana-transaction') assert.fail()
  assert.strictEqual(terms.payment.fee_payer, relayerKp.publicKey.toBase58())
  const { tx_ref } = await adapter.relay.relay({ ...args(payload(escrow_id)), payment: signTerms(terms) })

  // On-chain: the escrow PDA exists, owned by the program, creator = agent.
  const account = fx.svm.getAccount(escrowPdaFromUuid(escrow_id))
  assert.ok(account, 'escrow account exists')
  assert.ok(account.owner.equals(TEST_PROGRAM.programId))
  const escrow = decodeEscrowAccount(TEST_PROGRAM.coder, Buffer.from(account.data))
  assert.ok(escrow.creator.equals(agent.publicKey))
  assert.strictEqual(escrow.amount.toString(), AMOUNT.toString())
  assert.strictEqual(tokenBalance(tokenVaultPda(uuidToBytes(escrow_id))), AMOUNT)
  assert.strictEqual(usdcBefore - tokenBalance(agentAta), AMOUNT)
  // The fronted lamports were consumed by rent exactly: the agent holds none.
  assert.strictEqual(fx.svm.getBalance(agent.publicKey) ?? 0n, 0n)
  assert.ok((fx.svm.getBalance(relayerKp.publicKey) ?? 0n) < relayerBefore, 'relayer paid')

  // The verify pipeline decodes the ordinary EscrowCreated with the agent as actor.
  const verified = await adapter.verifyTx(tx_ref, { expected_event: 'EscrowCreated', escrow_id })
  assert.strictEqual(verified.confirmed, true)
  assert.strictEqual(verified.failed, false)
  if (!('event' in verified) || verified.event === undefined) assert.fail('expected a decoded event')
  assert.strictEqual(verified.event.actor, `${CHAIN_ID}:${agent.publicKey.toBase58()}`)

  // Replay of the same draft: a fresh quote simulates against an existing PDA and is refused.
  const again = await adapter.relay.quote(args(payload(escrow_id)))
  await assert.rejects(
    adapter.relay.relay({ ...args(payload(escrow_id)), payment: signTerms(again) }),
    (err: unknown) => err instanceof AppError && err.code === 'RELAY_REJECTED' && /simulation failed/.test(err.message),
  )
})

test('an expired blockhash is refused before co-signing — the agent requests fresh terms', { skip }, async () => {
  const escrow_id = randomUUID()
  assert.ok(adapter.relay)
  const payment = signTerms(await adapter.relay.quote(args(payload(escrow_id))))
  fx.svm.expireBlockhash()
  await assert.rejects(
    adapter.relay.relay({ ...args(payload(escrow_id)), payment }),
    (err: unknown) => err instanceof AppError && err.code === 'RELAY_REJECTED' && /blockhash has expired/.test(err.message),
  )
  assert.strictEqual(fx.svm.getAccount(escrowPdaFromUuid(escrow_id)), null)
})

test('native SOL: the agent must hold the amount; the relayer fronts only the rent', { skip }, async () => {
  const escrow_id = randomUUID()
  assert.ok(adapter.relay)
  const solAgent = Keypair.generate()
  fx.svm.airdrop(solAgent.publicKey, AMOUNT) // exactly the amount, no rent
  const relayArgs: RelayedCreateArgs = { user_id: 'agent', creator_address: solAgent.publicKey.toBase58(), payload: payload(escrow_id, { asset: 'SOL_DEVNET' }) }
  const terms = await adapter.relay.quote(relayArgs)
  if (terms.payment.kind !== 'solana-transaction') assert.fail()
  const tx = VersionedTransaction.deserialize(Buffer.from(terms.payment.transaction, 'base64'))
  tx.sign([solAgent])
  await adapter.relay.relay({ ...relayArgs, payment: { x402Version: X402_VERSION, scheme: TENDA_RELAY_SCHEME, network: CHAIN_ID, payload: { transaction: Buffer.from(tx.serialize()).toString('base64') } } })
  assert.strictEqual(fx.svm.getBalance(vaultPda(uuidToBytes(escrow_id))) ?? 0n, AMOUNT)
  assert.strictEqual(fx.svm.getBalance(solAgent.publicKey) ?? 0n, 0n)
  const escrow = decodeEscrowAccount(TEST_PROGRAM.coder, Buffer.from(fx.svm.getAccount(escrowPdaFromUuid(escrow_id))!.data))
  assert.ok(escrow.asset.equals(SystemProgram.programId))
})
