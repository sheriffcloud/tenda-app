/**
 * The EVM relayed create (chains/evm/relay), fully offline: a real
 * secp256k1 signer signs the terms the adapter issues, and the relay must
 * turn that — and nothing else — into `createEscrowFor` calldata for the
 * relayer. The contract's own view of the nonce is proven on anvil; here the
 * adapter is held to its own terms.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { decodeFunctionData, hashDomain, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ESCROW_EVM_ABI } from '@server/chains/evm/rpc'
import type { EvmRpc } from '@server/chains/evm/rpc'
import { evmAdapter, type EvmAdapterDeps } from '@server/chains/evm'
import { EIP712_DOMAIN_FIELDS } from '@server/chains/evm/permit'
import { authorizationNonce, buildCreateParams } from '@server/chains/evm/create-params'
import type { EvmRelayCall, EvmRelayer } from '@server/chains/evm/relay/relayer'
import { AppError } from '@server/lib/errors'
import type { CreateEscrowPayload, RelayedCreateArgs } from '@server/chains/types'
import type { ReceiveAuthorizationTypedData, RelayPaymentPayload, RelayTerms } from '@tenda/shared'
import { RELAY_QUOTE_TTL_SECONDS, TENDA_RELAY_SCHEME, X402_VERSION } from '@tenda/shared'

const CHAIN_ID = 'eip155:84532'
const CONTRACT = `0x${'e5'.repeat(20)}` as const
const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const
const RELAYER = `0x${'aa'.repeat(20)}` as const
const TX = `0x${'ab'.repeat(32)}` as const
const AGENT_KEY = `0x${'59'.repeat(32)}` as const
const OTHER_KEY = `0x${'7a'.repeat(32)}` as const
const agent = privateKeyToAccount(AGENT_KEY)
const other = privateKeyToAccount(OTHER_KEY)

const DOMAIN = { name: 'USDC', version: '2', chainId: 84532, verifyingContract: TOKEN }
const DOMAIN_SEPARATOR = hashDomain({
  domain: { ...DOMAIN, chainId: BigInt(DOMAIN.chainId) },
  types: { EIP712Domain: [...EIP712_DOMAIN_FIELDS] },
})

function payload(overrides: Partial<CreateEscrowPayload> = {}): CreateEscrowPayload {
  return {
    escrow_id: '0d9cd2a4-3f1e-4b6a-9c3d-2f1e4b6a9c3d',
    kind: 'gig',
    asset: 'USDC_BASE',
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
  return { user_id: 'agent', creator_address: agent.address, payload: payload(), ...overrides }
}

function fakeRpc(overrides: Partial<EvmRpc> = {}): EvmRpc {
  return {
    async getTransactionReceipt() { return null },
    async getBlockNumber() { return 100n },
    async getLogRefs() { return [] },
    async readEscrow() { return null },
    async readPermitFacts() { return { name: DOMAIN.name, nonce: 0n, domain_separator: DOMAIN_SEPARATOR } },
    ...overrides,
  }
}

interface FakeRelayer extends EvmRelayer {
  simulated: EvmRelayCall[]
  sent: EvmRelayCall[]
  /** How often the live token probe ran — an RPC read the relay must not spend on a foreign envelope. */
  probes: number
}

function fakeRelayer(overrides: Partial<EvmRelayer> = {}): FakeRelayer {
  const simulated: EvmRelayCall[] = []
  const sent: EvmRelayCall[] = []
  const state: FakeRelayer = {
    address: RELAYER,
    simulated,
    sent,
    probes: 0,
    async supportsReceiveWithAuthorization() { state.probes += 1; return true },
    async simulate(call) { simulated.push(call) },
    async send(call) { sent.push(call); return TX },
    ...overrides,
  }
  return state
}

function makeAdapter(relayer: EvmRelayer, deps: Partial<EvmAdapterDeps> = {}, chain_id = CHAIN_ID) {
  return evmAdapter({
    chain_id,
    rpc_url: 'http://unused.invalid',
    escrow_contract: CONTRACT,
    min_confirmations: 1,
    deps: {
      resolveWalletAddress: async () => `0x${'44'.repeat(20)}`,
      resolveAsset: async (asset) => (asset === 'ETH_BASE' || asset === 'CELO' ? { token_address: null } : { token_address: TOKEN }),
      rpc: fakeRpc(),
      relayer,
      ...deps,
    },
  })
}

/** Sign the terms exactly as an agent would (eth_signTypedData_v4). */
function sign(account: typeof agent, typed: ReceiveAuthorizationTypedData): Promise<Hex> {
  return account.signTypedData({
    domain: { ...typed.domain, verifyingContract: typed.domain.verifyingContract as Hex },
    types: { ReceiveWithAuthorization: typed.types.ReceiveWithAuthorization },
    primaryType: 'ReceiveWithAuthorization',
    message: {
      from: typed.message.from as Hex,
      to: typed.message.to as Hex,
      value: BigInt(typed.message.value),
      validAfter: BigInt(typed.message.validAfter),
      validBefore: BigInt(typed.message.validBefore),
      nonce: typed.message.nonce as Hex,
    },
  })
}

async function paymentFor(terms: RelayTerms, signer = agent, mutate: (m: ReceiveAuthorizationTypedData['message']) => void = () => {}): Promise<RelayPaymentPayload> {
  if (terms.payment.kind !== 'eip155-authorization') throw new Error('unexpected terms kind')
  const typed = structuredClone(terms.payment.typed_data)
  mutate(typed.message)
  const signature = await sign(signer, typed)
  const m = typed.message
  return {
    x402Version: X402_VERSION,
    scheme: TENDA_RELAY_SCHEME,
    network: terms.network,
    payload: { signature, authorization: { from: m.from, to: m.to, value: m.value, validAfter: m.validAfter, validBefore: m.validBefore, nonce: m.nonce } },
  }
}

const refusedWith = (code: 'RELAY_REJECTED' | 'RELAY_UNAVAILABLE', pattern: RegExp) => (err: unknown): boolean =>
  err instanceof AppError && err.statusCode === 422 && err.code === code && pattern.test(err.message)
const rejectedWith = (pattern: RegExp) => refusedWith('RELAY_REJECTED', pattern)
const unavailableWith = (pattern: RegExp) => refusedWith('RELAY_UNAVAILABLE', pattern)

// ---------- surface -----------------------------------------------------------

test('the relay surface exists only when a relayer is configured', () => {
  assert.strictEqual(makeAdapter(fakeRelayer()).relay?.relayer_address, RELAYER)
  assert.strictEqual(makeAdapter(fakeRelayer(), { relayer: undefined }).relay, undefined)
})

// ---------- quote --------------------------------------------------------------

test('quote: the terms are an EIP-3009 authorization for exactly the draft', async () => {
  const relay = makeAdapter(fakeRelayer()).relay!
  const before = Math.floor(Date.now() / 1000)
  const terms = await relay.quote(args())
  assert.strictEqual(terms.scheme, TENDA_RELAY_SCHEME)
  assert.strictEqual(terms.network, CHAIN_ID)
  assert.strictEqual(terms.asset, TOKEN)
  assert.strictEqual(terms.asset_id, 'USDC_BASE')
  assert.strictEqual(terms.amount_raw, '25000000')
  assert.strictEqual(terms.pay_to, CONTRACT)
  assert.strictEqual(terms.escrow_id, payload().escrow_id)
  assert.strictEqual(terms.max_timeout_seconds, RELAY_QUOTE_TTL_SECONDS)
  assert.ok(terms.expires_at_unix >= before + RELAY_QUOTE_TTL_SECONDS)
  assert.strictEqual(terms.payment.kind, 'eip155-authorization')
  if (terms.payment.kind !== 'eip155-authorization') return
  assert.strictEqual(terms.payment.creator, agent.address)
  const typed = terms.payment.typed_data
  assert.deepStrictEqual(typed.domain, DOMAIN)
  assert.strictEqual(typed.primaryType, 'ReceiveWithAuthorization')
  assert.deepStrictEqual(typed.types.ReceiveWithAuthorization.map((f) => f.name), ['from', 'to', 'value', 'validAfter', 'validBefore', 'nonce'])
  assert.strictEqual(typed.message.from, agent.address)
  assert.strictEqual(typed.message.to, CONTRACT)
  assert.strictEqual(typed.message.value, '25000000')
  assert.strictEqual(typed.message.validAfter, '0')
  assert.strictEqual(typed.message.validBefore, String(terms.expires_at_unix))
  // The nonce IS the hash of the whole struct the terms show.
  const params = buildCreateParams(payload(), { asset_address: TOKEN, assigned_counterparty_address: null })
  assert.strictEqual(typed.message.nonce, authorizationNonce(params))
  assert.deepStrictEqual(terms.payment.create_params, {
    escrowId: params.escrowId, kind: 0, asset: TOKEN, amount: '25000000', assignedCounterparty: `0x${'00'.repeat(20)}`,
    acceptDeadline: '1900000000', completionDuration: '7200', disputeBond: '0', isSeeker: false, requiresApproval: false, unassignWindowSeconds: '0',
  })
})

test('quote: an assigned counterparty is resolved into the struct (and so into the nonce)', async () => {
  const relay = makeAdapter(fakeRelayer()).relay!
  const terms = await relay.quote(args({ payload: payload({ assigned_counterparty_user_id: 'worker' }) }))
  if (terms.payment.kind !== 'eip155-authorization') assert.fail()
  assert.strictEqual(terms.payment.create_params.assignedCounterparty, `0x${'44'.repeat(20)}`)
  const plain = await relay.quote(args())
  if (plain.payment.kind !== 'eip155-authorization') assert.fail()
  assert.notStrictEqual(terms.payment.typed_data.message.nonce, plain.payment.typed_data.message.nonce)
})

test('quote refusals: native asset, an asset without eip3009, a token without the typehash, a domain mismatch', async () => {
  await assert.rejects(makeAdapter(fakeRelayer()).relay!.quote(args({ payload: payload({ asset: 'ETH_BASE' }) })), unavailableWith(/cannot fund an escrow by signature/))
  // cUSD on CELO: manifest-listed, permit-less, so never eip3009.
  await assert.rejects(makeAdapter(fakeRelayer(), {}, 'eip155:42220').relay!.quote(args({ payload: payload({ asset: 'cUSD' }) })), unavailableWith(/cannot fund an escrow by signature/))
  await assert.rejects(
    makeAdapter(fakeRelayer({ supportsReceiveWithAuthorization: async () => false })).relay!.quote(args()),
    unavailableWith(/does not implement EIP-3009/),
  )
  // Registry drift: the manifest declares eip3009 but the seeded asset row resolves native.
  await assert.rejects(makeAdapter(fakeRelayer(), { resolveAsset: async () => ({ token_address: null }) }).relay!.quote(args()), unavailableWith(/is native on eip155:84532/))
  await assert.rejects(
    makeAdapter(fakeRelayer(), { rpc: fakeRpc({ readPermitFacts: async () => ({ name: 'Renamed', nonce: 0n, domain_separator: DOMAIN_SEPARATOR }) }) }).relay!.quote(args()),
    unavailableWith(/domain mismatch/),
  )
})

// ---------- relay --------------------------------------------------------------

test('relay: a signature over the terms becomes createEscrowFor calldata, simulated then sent', async () => {
  const relayer = fakeRelayer()
  const relay = makeAdapter(relayer).relay!
  const terms = await relay.quote(args())
  const payment = await paymentFor(terms)
  const { tx_ref } = await relay.relay({ ...args(), payment })
  assert.strictEqual(tx_ref, TX)
  assert.strictEqual(relayer.simulated.length, 1)
  assert.strictEqual(relayer.sent.length, 1)
  assert.deepStrictEqual(relayer.sent[0], relayer.simulated[0])
  assert.strictEqual(relayer.sent[0]!.to, CONTRACT)
  const decoded = decodeFunctionData({ abi: ESCROW_EVM_ABI, data: relayer.sent[0]!.data })
  assert.strictEqual(decoded.functionName, 'createEscrowFor')
  const [creator, params, auth] = decoded.args as [Hex, Record<string, unknown>, Record<string, unknown>]
  assert.strictEqual(creator, agent.address)
  assert.strictEqual(params.amount, 25_000_000n)
  assert.strictEqual(params.asset, TOKEN)
  assert.strictEqual(auth.validAfter, 0n)
  assert.strictEqual(auth.validBefore, BigInt(terms.expires_at_unix))
  assert.ok(typeof auth.v === 'number' && (auth.v === 27 || auth.v === 28))
  // Hex casing is not identity: an artifact that upper-cases `from` (same 20 bytes, same signature)
  // must relay and encode the canonical creator — viem refuses a non-checksummed spelling at encode time.
  const shout = (p: RelayPaymentPayload): RelayPaymentPayload => ({ ...p, payload: 'authorization' in p.payload ? { ...p.payload, authorization: { ...p.payload.authorization, from: p.payload.authorization.from.toUpperCase().replace('0X', '0x') } } : p.payload })
  assert.strictEqual((await relay.relay({ ...args(), payment: shout(payment) })).tx_ref, TX)
  assert.strictEqual((decodeFunctionData({ abi: ESCROW_EVM_ABI, data: relayer.sent[1]!.data }).args as [Hex])[0], agent.address)
})

test('relay: a simulation failure is RELAY_REJECTED with the reason, and nothing is sent', async () => {
  const relayer = fakeRelayer({ simulate: async () => { throw new Error('execution reverted: EscrowAlreadyExists()') } })
  const relay = makeAdapter(relayer).relay!
  const payment = await paymentFor(await relay.quote(args()))
  await assert.rejects(relay.relay({ ...args(), payment }), rejectedWith(/simulation failed: .*EscrowAlreadyExists/))
  assert.strictEqual(relayer.sent.length, 0)
  // A transport that rejects with a non-Error still names the reason rather than "[object Object]".
  const bare = makeAdapter(fakeRelayer({ simulate: () => Promise.reject(new String('rpc unreachable')) })).relay!
  await assert.rejects(bare.relay({ ...args(), payment: await paymentFor(await bare.quote(args())) }), rejectedWith(/simulation failed: rpc unreachable/))
})

test('relay: a foreign envelope is refused before any RPC read — the token probe never runs', async () => {
  const relayer = fakeRelayer()
  const relay = makeAdapter(relayer).relay!
  const good = await paymentFor(await relay.quote(args()))
  const probesAfterQuote = relayer.probes
  await assert.rejects(relay.relay({ ...args(), payment: { ...good, scheme: 'exact' } }), rejectedWith(/scheme must be/))
  await assert.rejects(relay.relay({ ...args(), payment: { ...good, network: 'eip155:8453' } }), rejectedWith(/network must be/))
  assert.strictEqual(relayer.probes, probesAfterQuote, 'no live read for an envelope we would never accept')
})

test('relay refuses every departure from the terms before spending gas', async () => {
  const relayer = fakeRelayer()
  const relay = makeAdapter(relayer).relay!
  const terms = await relay.quote(args())
  const good = await paymentFor(terms)
  const cases: Array<[string, Promise<RelayPaymentPayload> | RelayPaymentPayload, RegExp, Partial<RelayedCreateArgs>?]> = [
    ['foreign scheme', { ...good, scheme: 'exact' }, /scheme must be tenda-escrow-create/],
    ['other network', { ...good, network: 'eip155:8453' }, /network must be eip155:84532/],
    ['solana-shaped payload', { ...good, payload: { transaction: 'AAAA' } }, /must carry an EIP-3009 authorization/],
    ['from is not the creator', paymentFor(terms, agent, (m) => { m.from = other.address }), /from must be the creator/],
    ['to is not the escrow contract', paymentFor(terms, agent, (m) => { m.to = RELAYER }), /to must be the escrow contract/],
    ['value differs', paymentFor(terms, agent, (m) => { m.value = '25000001' }), /value must be the escrow amount/],
    ['nonce differs', paymentFor(terms, agent, (m) => { m.nonce = `0x${'99'.repeat(32)}` }), /nonce must be the hash/],
    ['not yet valid', paymentFor(terms, agent, (m) => { m.validAfter = '1900000000' }), /not yet valid/],
    ['expiring too soon', paymentFor(terms, agent, (m) => { m.validBefore = String(Math.floor(Date.now() / 1000) + 10) }), /expires within/],
    ['signed by another key', paymentFor(terms, other), /does not recover to the creator/],
    ['terms changed since the quote (duration)', good, /nonce must be the hash/, { payload: payload({ completion_duration_seconds: 7_201 }) }],
  ]
  for (const [label, pending, pattern, override] of cases) {
    const payment = await pending
    await assert.rejects(relay.relay({ ...args(), ...override, payment }), rejectedWith(pattern), label)
  }
  // Field-shape refusals the codec normally screens out, kept here because
  // the validator is the last line for any caller that is not the header.
  const authorization = 'authorization' in good.payload ? good.payload.authorization : assert.fail()
  const shaped = (patch: Partial<typeof authorization>, signature = 'signature' in good.payload ? good.payload.signature : ''): RelayPaymentPayload => ({
    ...good,
    payload: { signature, authorization: { ...authorization, ...patch } },
  })
  await assert.rejects(relay.relay({ ...args(), payment: shaped({ validAfter: 'soon' }) }), rejectedWith(/validAfter must be a unix timestamp/), 'validAfter text')
  await assert.rejects(relay.relay({ ...args(), payment: shaped({ validBefore: '1e9' }) }), rejectedWith(/validBefore must be a unix timestamp/), 'validBefore text')
  await assert.rejects(relay.relay({ ...args(), payment: shaped({}, '0x1234') }), rejectedWith(/signature must be a 65-byte/), 'short signature')
  const garbage = { ...good, payload: { ...good.payload, signature: `0x${'ff'.repeat(65)}` } }
  await assert.rejects(relay.relay({ ...args(), payment: garbage }), rejectedWith(/signature is not a valid signature|does not recover/), 'garbage signature')
  assert.strictEqual(relayer.simulated.length, 0)
  assert.strictEqual(relayer.sent.length, 0)
})
