/**
 * Agent-side test helpers (#19): register an agent THROUGH the real route
 * with a wallet proof on the harness's eip155 chain (the one whose fake
 * adapter carries a relay), and the one-shot task body the suites post.
 *
 * The harness's fake registry accepts any signature except FAKE_BAD_SIGNATURE,
 * so the proof is real in shape (nonce, message) and only the crypto is
 * stubbed — exactly the seam every wallet-auth suite already uses.
 */
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Hex, PrivateKeyAccount } from 'viem'
import { TENDA_RELAY_SCHEME, X402_VERSION, apiRoutes, type AgentRegisterResponse, type AgentTaskBody, type PermitSignatureBody, type ReceiveAuthorizationTypedData, type RelayPaymentPayload, type RelayTerms } from '@tenda/shared'
import { buildAuthMessage, issueNonce } from './auth-message'
import { TEST_ASSET_ALT, TEST_CHAIN_ID_ALT } from './test-app'

/** A fresh, well-formed EVM address per call (the wallet primary key is (chain_ns, address)). */
export function agentWalletAddress(): string {
  return `0x${randomUUID().replace(/-/g, '')}00000000`
}

export interface RegisteredAgent {
  response: AgentRegisterResponse
  token: string
  address: string
}

/** POST /v1/agent/register with a proof for `address` on the eip155 harness chain. */
export async function registerAgent(
  app: FastifyInstance,
  args: { address?: string; name?: string; country?: string; signature?: string } = {},
): Promise<RegisteredAgent> {
  const address = args.address ?? agentWalletAddress()
  const { nonce, issued_at } = await issueNonce(app)
  const res = await app.inject({
    method: 'POST',
    url: apiRoutes.agent.register,
    payload: {
      chain_id: TEST_CHAIN_ID_ALT,
      address,
      message: buildAuthMessage({ address, chain_id: TEST_CHAIN_ID_ALT, nonce, issued_at }),
      signature: args.signature ?? 'sig:agent',
      name: args.name ?? 'Dispatch Bot',
      ...(args.country !== undefined ? { country: args.country } : {}),
    },
  })
  assert.strictEqual(res.statusCode, 200, res.body)
  const response = res.json<AgentRegisterResponse>()
  return { response, token: response.token, address }
}

/**
 * What the REFUSAL cases post: the one-shot body with fields missing, and the
 * corruptions they exercise on purpose — a `category` outside the vocabulary
 * and a `permit`, which the one-shot refuses. Here rather than in each suite
 * because the escrow half and the listing half both send them, and two copies
 * of the same widening drift.
 */
export type TaskPost = Omit<Partial<AgentTaskBody>, 'category'> & {
  category?: string
  permit?: PermitSignatureBody
}

/** What a one-shot task is worth — the body and the X-PAYMENT envelope that funds it must agree, so both read this. */
const AGENT_TASK_AMOUNT_RAW = '25000000'

/** A valid one-shot body on the eip155 harness chain; override any field. */
export function agentTaskBody(overrides: Partial<AgentTaskBody> = {}): AgentTaskBody {
  return {
    creation_operation_id: randomUUID(),
    chain_id: TEST_CHAIN_ID_ALT,
    asset: TEST_ASSET_ALT,
    amount_raw: AGENT_TASK_AMOUNT_RAW,
    accept_window_seconds: 24 * 3600,
    completion_duration_seconds: 3_600,
    title: 'Photograph the storefront at 12 Broad St',
    category: 'service',
    country: 'NG',
    city: 'Lagos',
    proof_requirements: ['image'],
    ...overrides,
  }
}

/**
 * The base64 `X-PAYMENT` envelope a resend carries: an EIP-3009 authorization
 * from `from`, in the shape `decodePaymentHeader` accepts. The harness's
 * eip155 relay is a fake with a constant reference, so only the SHAPE is real
 * — what the artifact must actually satisfy is the adapters' own suites.
 *
 * Here rather than inline in each suite because it is the one-shot's wire
 * envelope: a second hand-written copy drifts the moment that wire changes.
 */
export function agentPaymentHeader(from: string): string {
  return Buffer.from(
    JSON.stringify({
      x402Version: X402_VERSION,
      scheme: TENDA_RELAY_SCHEME,
      network: TEST_CHAIN_ID_ALT,
      payload: {
        signature: `0x${'44'.repeat(65)}`,
        authorization: {
          from,
          to: `0x${'f1'.repeat(20)}`,
          value: AGENT_TASK_AMOUNT_RAW,
          validAfter: '0',
          validBefore: '1900000000',
          nonce: `0x${'33'.repeat(32)}`,
        },
      },
    }),
  ).toString('base64')
}

/**
 * What an agent actually does with 402 terms: sign the typed data VERBATIM and
 * put it back in the envelope the resend carries.
 *
 * Verbatim is the point — nothing here is re-derived from the request, so a
 * server that hands out terms it will not accept fails the test instead of
 * being quietly corrected by it. viem needs its own value types (bigints, Hex),
 * which is the only reason the message is rebuilt at all; the envelope's
 * `authorization` is the server's own string form, untouched.
 *
 * Shared by the relay suite and by #109's recorder: they must sign the same
 * way, or the published example would document a signature no other caller
 * produces.
 */
export async function signRelayTerms(account: PrivateKeyAccount, terms: RelayTerms): Promise<RelayPaymentPayload> {
  if (terms.payment.kind !== 'eip155-authorization') throw new Error('unexpected terms')
  const typed: ReceiveAuthorizationTypedData = terms.payment.typed_data
  const m = typed.message
  const signature = await account.signTypedData({
    domain: { ...typed.domain, verifyingContract: typed.domain.verifyingContract as Hex },
    types: { ReceiveWithAuthorization: typed.types.ReceiveWithAuthorization },
    primaryType: 'ReceiveWithAuthorization',
    message: {
      from: m.from as Hex,
      to: m.to as Hex,
      value: BigInt(m.value),
      validAfter: BigInt(m.validAfter),
      validBefore: BigInt(m.validBefore),
      nonce: m.nonce as Hex,
    },
  })
  return {
    x402Version: X402_VERSION,
    scheme: TENDA_RELAY_SCHEME,
    network: terms.network,
    payload: {
      signature,
      authorization: { from: m.from, to: m.to, value: m.value, validAfter: m.validAfter, validBefore: m.validBefore, nonce: m.nonce },
    },
  }
}
