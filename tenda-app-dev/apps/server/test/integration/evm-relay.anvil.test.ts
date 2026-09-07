/**
 * Relayed funding (#18) against a REAL node: an agent that holds mock USDC
 * and ZERO ETH funds an escrow through the server's real quote → signature →
 * relay path, with the relayer hot wallet (a real viem wallet on anvil)
 * paying the gas. The contract's own `authorizationNonce` is compared with
 * the server's, since the whole binding rests on the two agreeing.
 */
import { after, before, test } from 'node:test'
import * as assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { evmAdapter } from '@server/chains/evm'
import { authorizationNonce, buildCreateParams } from '@server/chains/evm/create-params'
import { viemEvmRelayer } from '@server/chains/evm/relay/relayer'
import { AppError } from '@server/lib/errors'
import type { CreateEscrowPayload, RelayedCreateArgs } from '@server/chains/types'
import { TENDA_RELAY_SCHEME, X402_VERSION, type ReceiveAuthorizationTypedData, type RelayPaymentPayload, type RelayTerms } from '@tenda/shared'
import { ANVIL_CHAIN_ID, ANVIL_KEYS, ERC20_ABI, anvilSkip, startAnvilFixture, type AnvilFixture } from '../helpers/anvil'

const skip = anvilSkip
const PORT = 8572
const AMOUNT = '25000000'

// The agent: a fresh key with USDC and no ETH — the case the relayer exists for.
const agent = privateKeyToAccount(generatePrivateKey())

let fx: AnvilFixture
let adapter: ReturnType<typeof evmAdapter>
let relayerAddress: `0x${string}`

before(async () => {
  if (skip) return
  fx = await startAnvilFixture(PORT)
  const mint = await fx.creatorWallet.writeContract({ address: fx.tokenAddr, abi: ERC20_ABI, functionName: 'mint', args: [agent.address, 100_000_000n] })
  await fx.pub.waitForTransactionReceipt({ hash: mint })
  const relayer = viemEvmRelayer({ rpc_url: fx.rpc_url, chain_id: ANVIL_CHAIN_ID, private_key: ANVIL_KEYS.relayer })
  relayerAddress = relayer.address
  adapter = evmAdapter({
    chain_id: ANVIL_CHAIN_ID,
    rpc_url: fx.rpc_url,
    escrow_contract: fx.escrowAddr,
    min_confirmations: 0,
    deps: {
      resolveWalletAddress: async () => fx.worker.address,
      resolveAsset: async (asset) => (asset === 'ETH_BASE' ? { token_address: null } : { token_address: fx.tokenAddr }),
      relayer,
    },
  })
})

after(() => {
  fx?.kill()
})

function payload(escrow_id: string, overrides: Partial<CreateEscrowPayload> = {}): CreateEscrowPayload {
  return {
    escrow_id,
    kind: 'gig',
    asset: 'USDC_BASE',
    amount_raw: AMOUNT,
    accept_deadline_unix: Math.floor(Date.now() / 1000) + 3_600,
    completion_duration_seconds: 7_200,
    dispute_bond_raw: '0',
    is_seeker: false,
    requires_approval: false,
    unassign_window_seconds: 0,
    ...overrides,
  }
}
const args = (p: CreateEscrowPayload): RelayedCreateArgs => ({ user_id: 'agent', creator_address: agent.address, payload: p })

/** What the agent does with the terms: sign the typed data verbatim. */
async function signTerms(terms: RelayTerms): Promise<RelayPaymentPayload> {
  if (terms.payment.kind !== 'eip155-authorization') throw new Error('unexpected terms')
  const typed: ReceiveAuthorizationTypedData = terms.payment.typed_data
  const signature = await agent.signTypedData({
    domain: { ...typed.domain, verifyingContract: typed.domain.verifyingContract as Hex },
    types: { ReceiveWithAuthorization: typed.types.ReceiveWithAuthorization },
    primaryType: 'ReceiveWithAuthorization',
    message: {
      from: typed.message.from as Hex, to: typed.message.to as Hex, value: BigInt(typed.message.value),
      validAfter: BigInt(typed.message.validAfter), validBefore: BigInt(typed.message.validBefore), nonce: typed.message.nonce as Hex,
    },
  })
  const m = typed.message
  return { x402Version: X402_VERSION, scheme: TENDA_RELAY_SCHEME, network: terms.network, payload: { signature, authorization: { from: m.from, to: m.to, value: m.value, validAfter: m.validAfter, validBefore: m.validBefore, nonce: m.nonce } } }
}

const usdcOf = (owner: `0x${string}`) => fx.pub.readContract({ address: fx.tokenAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [owner] })

test('the server-derived authorization nonce equals the contract\'s authorizationNonce for the same params', { skip }, async () => {
  const p = payload(randomUUID(), { assigned_counterparty_user_id: 'worker', dispute_bond_raw: '1000000', requires_approval: false })
  const params = buildCreateParams(p, { asset_address: fx.tokenAddr, assigned_counterparty_address: fx.worker.address })
  const onchain = await fx.pub.readContract({ address: fx.escrowAddr, abi: fx.escrowAbi, functionName: 'authorizationNonce', args: [params] })
  assert.strictEqual(onchain, authorizationNonce(params))
})

test('the live EIP-3009 probe: the mock answers, a contract without the getter does not', { skip }, async () => {
  const relayer = viemEvmRelayer({ rpc_url: fx.rpc_url, chain_id: ANVIL_CHAIN_ID, private_key: ANVIL_KEYS.relayer })
  assert.strictEqual(await relayer.supportsReceiveWithAuthorization(fx.tokenAddr), true)
  assert.strictEqual(await relayer.supportsReceiveWithAuthorization(fx.escrowAddr), false)
})

test('an agent with USDC and no ETH funds an escrow: quote → sign → relay, relayer pays gas, agent is the creator', { skip }, async () => {
  const escrow_id = randomUUID()
  assert.ok(adapter.relay)
  assert.strictEqual(await fx.pub.getBalance({ address: agent.address }), 0n, 'agent starts with no ETH')
  const agentUsdcBefore = await usdcOf(agent.address)
  const relayerEthBefore = await fx.pub.getBalance({ address: relayerAddress })

  // ONE draft, reused for every call below. `payload()` derives its accept
  // deadline from Date.now() at whole-second resolution, and the EIP-3009 nonce
  // is the hash of the WHOLE CreateParams — deadline included. Rebuilding the
  // draft per call therefore signs one set of terms and presents another the
  // moment a call lands in a later second, and the relayer rightly refuses at
  // the nonce. That is #44: not a nonce race, just elapsed wall clock, which is
  // why it only bit under a loaded full-suite run.
  const draft = payload(escrow_id)
  const terms = await adapter.relay.quote(args(draft))
  assert.strictEqual(terms.pay_to, fx.escrowAddr)
  assert.strictEqual(terms.asset, fx.tokenAddr)
  const payment = await signTerms(terms)
  const { tx_ref } = await adapter.relay.relay({ ...args(draft), payment })

  const receipt = await fx.pub.waitForTransactionReceipt({ hash: tx_ref as Hex })
  assert.strictEqual(receipt.status, 'success')
  assert.strictEqual(receipt.from.toLowerCase(), relayerAddress.toLowerCase(), 'the relayer sent it')
  // The verify pipeline sees an ordinary EscrowCreated with the AGENT as creator.
  const verified = await adapter.verifyTx(tx_ref, { expected_event: 'EscrowCreated', escrow_id })
  assert.strictEqual(verified.confirmed, true)
  assert.strictEqual(verified.failed, false)
  if (!('event' in verified) || verified.event === undefined) assert.fail('expected a decoded event')
  assert.strictEqual(verified.event.fields.creator.toLowerCase(), agent.address.toLowerCase())
  assert.strictEqual(verified.event.actor, `${ANVIL_CHAIN_ID}:${agent.address}`)
  // Money: the agent paid the amount and nothing else; the relayer paid gas.
  assert.strictEqual(agentUsdcBefore - (await usdcOf(agent.address)), BigInt(AMOUNT))
  assert.strictEqual(await fx.pub.getBalance({ address: agent.address }), 0n)
  assert.ok((await fx.pub.getBalance({ address: relayerAddress })) < relayerEthBefore)
  assert.strictEqual(await usdcOf(fx.escrowAddr), BigInt(AMOUNT))
  const state = await adapter.fetchEscrowState(`0x${escrow_id.replace(/-/g, '')}`)
  assert.strictEqual(state?.creator_address.toLowerCase(), agent.address.toLowerCase())
  assert.strictEqual(state?.status, 'open')

  // Replay: the same artifact again fails simulation (escrow exists / nonce used) — never broadcast.
  await assert.rejects(
    adapter.relay.relay({ ...args(draft), payment }),
    (err: unknown) => err instanceof AppError && err.code === 'RELAY_REJECTED' && /simulation failed/.test(err.message),
  )
})

test('a signature over one draft cannot fund altered terms: the relayer refuses at the nonce, the contract would at the token', { skip }, async () => {
  const escrow_id = randomUUID()
  assert.ok(adapter.relay)
  // One draft, so the pre-assigned worker is the ONLY thing that differs below.
  // Rebuilding it would let the accept deadline drift too, and the refusal this
  // test asserts could then be caused by that drift rather than by the altered
  // term — passing for a reason other than the one it names (#44).
  const draft = payload(escrow_id)
  const payment = await signTerms(await adapter.relay.quote(args(draft)))
  // The relayer's own check (a pre-assigned worker changes the struct → the nonce).
  await assert.rejects(
    adapter.relay.relay({
      ...args({ ...draft, assigned_counterparty_user_id: 'worker' }),
      payment,
    }),
    (err: unknown) => err instanceof AppError && err.code === 'RELAY_REJECTED' && /nonce must be the hash/.test(err.message),
  )
  // The honest terms still fund — the signature was not consumed by the refusal.
  const { tx_ref } = await adapter.relay.relay({ ...args(draft), payment })
  assert.strictEqual((await fx.pub.waitForTransactionReceipt({ hash: tx_ref as Hex })).status, 'success')
})
