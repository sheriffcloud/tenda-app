/**
 * The Solana relayed create (chains/solana/relay), fully offline: real
 * ed25519 keypairs, the real instruction encoder, a fake relayer port. The
 * program's acceptance of the shape is the litesvm suite's job; here the
 * relay is held to its own terms — byte-identical transaction, creator
 * signature, fee payer, blockhash freshness — before it co-signs anything.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import nacl from 'tweetnacl'
import { ACCOUNT_SIZE } from '@solana/spl-token'
import { solanaAdapter } from '@server/chains/solana'
import { PROGRAM_ID } from '@server/chains/solana/pdas'
import type { SolanaRelayer } from '@server/chains/solana/relay/relayer'
import { AppError } from '@server/lib/errors'
import type { CreateEscrowPayload, RelayedCreateArgs } from '@server/chains/types'
import type { RelayPaymentPayload, RelayTerms } from '@tenda/shared'
import { SOLANA_BLOCKHASH_VALIDITY_SECONDS, TENDA_RELAY_SCHEME, X402_VERSION } from '@tenda/shared'
import { TEST_BLOCKHASH, USDC_MINT, fakeSolanaRpc } from '../helpers/solana'

const CHAIN_ID = 'solana:devnet'
const relayerKp = Keypair.generate()
const agent = Keypair.generate()
const stranger = Keypair.generate()
const ESCROW_RENT = 3_000_000n
const TOKEN_ACCOUNT_RENT = 2_039_280n
const SIG = 'RelayedSignature1111111111111111111111111111111111111111111111111111111111111111111111'

function payload(overrides: Partial<CreateEscrowPayload> = {}): CreateEscrowPayload {
  return {
    escrow_id: '0d9cd2a4-3f1e-4b6a-9c3d-2f1e4b6a9c3d',
    kind: 'gig',
    asset: 'USDC_SOL',
    amount_raw: '25000000',
    accept_deadline_unix: 1_900_000_000,
    completion_duration_seconds: 7_200,
    dispute_bond_raw: '0',
    is_seeker: false,
    requires_approval: false,
    unassign_window_seconds: 0,
    ...overrides,
  }
}
function args(overrides: Partial<RelayedCreateArgs> = {}): RelayedCreateArgs {
  return { user_id: 'agent', creator_address: agent.publicKey.toBase58(), payload: payload(), ...overrides }
}

interface FakeRelayer extends SolanaRelayer {
  balance: bigint
  blockhashValid: boolean
  simulationError: string | null
  signed: VersionedTransaction[]
  sent: VersionedTransaction[]
}

function fakeRelayer(): FakeRelayer {
  const state: FakeRelayer = {
    public_key: relayerKp.publicKey,
    balance: 0n,
    blockhashValid: true,
    simulationError: null,
    signed: [],
    sent: [],
    async getBalance() { return state.balance },
    async minimumBalanceForRentExemption(bytes) { return bytes === ACCOUNT_SIZE ? TOKEN_ACCOUNT_RENT : ESCROW_RENT },
    async isBlockhashValid() { return state.blockhashValid },
    async simulate() { return { err: state.simulationError, logs: [] } },
    sign(tx) { tx.sign([relayerKp]); state.signed.push(tx) },
    async send(tx) { state.sent.push(tx); return SIG },
  }
  return state
}

function makeAdapter(relayer: SolanaRelayer | undefined) {
  return solanaAdapter({
    chain_id: CHAIN_ID,
    rpc_url: 'http://127.0.0.1:8899',
    deps: {
      resolveWalletAddress: async () => stranger.publicKey.toBase58(),
      resolveAsset: async (asset) => (asset === 'SOL_DEVNET' ? { token_address: null } : { token_address: USDC_MINT.toBase58() }),
      rpc: fakeSolanaRpc(),
      ...(relayer !== undefined ? { relayer } : {}),
    },
  })
}

function txOf(terms: RelayTerms): VersionedTransaction {
  if (terms.payment.kind !== 'solana-transaction') throw new Error('unexpected terms kind')
  return VersionedTransaction.deserialize(Buffer.from(terms.payment.transaction, 'base64'))
}

/** Partial-sign as the agent would (one ed25519 signature) and wrap in the envelope. */
function paymentFor(tx: VersionedTransaction, signer: Keypair | null = agent, network = CHAIN_ID): RelayPaymentPayload {
  if (signer !== null) tx.sign([signer])
  return {
    x402Version: X402_VERSION,
    scheme: TENDA_RELAY_SCHEME,
    network,
    payload: { transaction: Buffer.from(tx.serialize()).toString('base64') },
  }
}

function rejectedWith(pattern: RegExp) {
  return (err: unknown): boolean =>
    err instanceof AppError && err.statusCode === 422 && err.code === 'RELAY_REJECTED' && pattern.test(err.message)
}

// ---------- surface + quote ----------------------------------------------------

test('the relay surface exists only when a relayer is configured', () => {
  assert.strictEqual(makeAdapter(fakeRelayer()).relay?.relayer_address, relayerKp.publicKey.toBase58())
  assert.strictEqual(makeAdapter(undefined).relay, undefined)
})

test('quote: the terms carry the create transaction with the relayer as fee payer and the creator as the other signer', async () => {
  const relay = makeAdapter(fakeRelayer()).relay!
  const before = Math.floor(Date.now() / 1000)
  const terms = await relay.quote(args())
  assert.strictEqual(terms.scheme, TENDA_RELAY_SCHEME)
  assert.strictEqual(terms.network, CHAIN_ID)
  assert.strictEqual(terms.asset, USDC_MINT.toBase58())
  assert.strictEqual(terms.pay_to, PROGRAM_ID.toBase58())
  assert.strictEqual(terms.max_timeout_seconds, SOLANA_BLOCKHASH_VALIDITY_SECONDS)
  assert.ok(terms.expires_at_unix >= before + SOLANA_BLOCKHASH_VALIDITY_SECONDS)
  if (terms.payment.kind !== 'solana-transaction') assert.fail()
  assert.strictEqual(terms.payment.fee_payer, relayerKp.publicKey.toBase58())
  assert.strictEqual(terms.payment.creator, agent.publicKey.toBase58())
  assert.strictEqual(terms.payment.recent_blockhash, TEST_BLOCKHASH)
  const msg = txOf(terms).message
  assert.strictEqual(msg.recentBlockhash, TEST_BLOCKHASH)
  assert.strictEqual(msg.header.numRequiredSignatures, 2)
  assert.ok(msg.staticAccountKeys[0]!.equals(relayerKp.publicKey))
  assert.ok(msg.staticAccountKeys[1]!.equals(agent.publicKey))
  // A creator holding nothing gets the rent shortfall transferred FIRST,
  // then the program's own create instruction — nothing else.
  const ixs = msg.compiledInstructions
  assert.strictEqual(ixs.length, 2)
  assert.ok(msg.staticAccountKeys[ixs[0]!.programIdIndex]!.equals(SystemProgram.programId))
  assert.ok(msg.staticAccountKeys[ixs[1]!.programIdIndex]!.equals(PROGRAM_ID))
  const lamports = Buffer.from(ixs[0]!.data).readBigUInt64LE(4)
  assert.strictEqual(lamports, ESCROW_RENT + TOKEN_ACCOUNT_RENT)
})

test('quote: the shortfall is what the creator LACKS — partial balances top up, sufficient balances get no transfer', async () => {
  const relayer = fakeRelayer()
  const relay = makeAdapter(relayer).relay!
  relayer.balance = ESCROW_RENT
  const partial = txOf(await relay.quote(args())).message
  assert.strictEqual(partial.compiledInstructions.length, 2)
  assert.strictEqual(Buffer.from(partial.compiledInstructions[0]!.data).readBigUInt64LE(4), TOKEN_ACCOUNT_RENT)
  relayer.balance = ESCROW_RENT + TOKEN_ACCOUNT_RENT
  const funded = txOf(await relay.quote(args())).message
  assert.strictEqual(funded.compiledInstructions.length, 1)
  assert.ok(funded.staticAccountKeys[funded.compiledInstructions[0]!.programIdIndex]!.equals(PROGRAM_ID))
})

test('quote: a native-SOL escrow requires the amount from the creator too, and only the rent is ever fronted on top', async () => {
  const relayer = fakeRelayer()
  const relay = makeAdapter(relayer).relay!
  relayer.balance = 25_000_000n // exactly the amount, no rent
  const terms = await relay.quote(args({ payload: payload({ asset: 'SOL_DEVNET' }) }))
  assert.strictEqual(terms.asset, SystemProgram.programId.toBase58())
  const msg = txOf(terms).message
  assert.strictEqual(Buffer.from(msg.compiledInstructions[0]!.data).readBigUInt64LE(4), ESCROW_RENT)
})

// ---------- relay ----------------------------------------------------------------

test('relay: the agent-signed quoted transaction is co-signed, simulated and sent', async () => {
  const relayer = fakeRelayer()
  const relay = makeAdapter(relayer).relay!
  const terms = await relay.quote(args())
  const { tx_ref } = await relay.relay({ ...args(), payment: paymentFor(txOf(terms)) })
  assert.strictEqual(tx_ref, SIG)
  assert.strictEqual(relayer.sent.length, 1)
  const sent = relayer.sent[0]!
  assert.strictEqual(sent.signatures.length, 2)
  assert.ok(sent.signatures.every((s) => !s.every((b) => b === 0)), 'both signatures present')
  assert.ok(Buffer.from(sent.message.serialize()).equals(Buffer.from(txOf(terms).message.serialize())))
})

test('relay: a stale blockhash or a failed simulation is refused, nothing sent', async () => {
  const relayer = fakeRelayer()
  const relay = makeAdapter(relayer).relay!
  relayer.blockhashValid = false
  await assert.rejects(relay.relay({ ...args(), payment: paymentFor(txOf(await relay.quote(args()))) }), rejectedWith(/blockhash has expired/))
  relayer.blockhashValid = true
  relayer.simulationError = '{"InstructionError":[1,{"Custom":6006}]}'
  await assert.rejects(relay.relay({ ...args(), payment: paymentFor(txOf(await relay.quote(args()))) }), rejectedWith(/simulation failed: .*6006/))
  assert.strictEqual(relayer.sent.length, 0)
})

test('relay refuses every departure from the quoted transaction before co-signing', async () => {
  const relayer = fakeRelayer()
  const relay = makeAdapter(relayer).relay!
  const terms = await relay.quote(args())
  const good = paymentFor(txOf(terms))

  const asPayer = (payer: PublicKey): VersionedTransaction =>
    new VersionedTransaction(
      new TransactionMessage({
        payerKey: payer,
        recentBlockhash: TEST_BLOCKHASH,
        instructions: [SystemProgram.transfer({ fromPubkey: payer, toPubkey: agent.publicKey, lamports: 1n })],
      }).compileToV0Message(),
    )
  // A stranger cannot `sign()` a transaction it is no signer of; forge the
  // creator's slot by hand, which is what a malicious client would do.
  const forgedByStranger = (tx: VersionedTransaction): RelayPaymentPayload => {
    tx.addSignature(agent.publicKey, nacl.sign.detached(tx.message.serialize(), stranger.secretKey))
    return paymentFor(tx, null)
  }
  const cases: Array<[string, RelayPaymentPayload, RegExp, Partial<RelayedCreateArgs>?]> = [
    ['foreign scheme', { ...good, scheme: 'exact' }, /scheme must be tenda-escrow-create/],
    ['other network', paymentFor(txOf(terms), null, 'solana:mainnet'), /network must be solana:devnet/],
    ['evm-shaped payload', { ...good, payload: { signature: '0x', authorization: { from: '', to: '', value: '', validAfter: '', validBefore: '', nonce: '' } } }, /must carry the partially signed transaction/],
    ['garbage transaction', { ...good, payload: { transaction: 'bm90IGEgdHg=' } }, /not a base64-encoded versioned transaction/],
    ['fee payer is not the relayer', paymentFor(asPayer(agent.publicKey), agent), /fee payer must be the relayer/],
    ['relayer-paid but not our instructions', paymentFor(asPayer(relayerKp.publicKey), null), /exactly the relayer and the creator must sign/],
    ['creator never signed', paymentFor(txOf(terms), null), /creator signature is missing/],
    ['signed by a stranger, forged into the creator slot', forgedByStranger(txOf(terms)), /signature does not verify/],
    ['terms changed since the quote (amount)', good, /differs from the quoted terms/, { payload: payload({ amount_raw: '26000000' }) }],
  ]
  for (const [label, payment, pattern, override] of cases) {
    await assert.rejects(relay.relay({ ...args(), ...override, payment }), rejectedWith(pattern), label)
  }
  // The creator's balance moved between quote and relay: the shortfall — and
  // so the transaction — is no longer the quoted one. Documented: re-quote.
  relayer.balance = ESCROW_RENT + TOKEN_ACCOUNT_RENT
  await assert.rejects(relay.relay({ ...args(), payment: good }), rejectedWith(/differs from the quoted terms/), 'balance changed')
  assert.strictEqual(relayer.signed.length, 0)
  assert.strictEqual(relayer.sent.length, 0)
})
