/**
 * Agent API v1 path items (#19): the write surface. Two operations, both
 * POST, spelled from the shared route map so they cannot drift from the
 * server; the drift test proves each is served and that the live 402/201
 * bodies validate against the closed schemas in ./schemas-agent.
 */
import { X402_VERSION, X_PAYMENT_HEADER, X_PAYMENT_RESPONSE_HEADER, apiRoutes } from '@tenda/shared'
import { errorResponse, json, type ParameterObject, type PathItem } from './paths'
import { ref } from './schema-types'

const BEARER = [{ bearer: [] as const }] as const

const paymentHeader: ParameterObject = {
  name: X_PAYMENT_HEADER,
  in: 'header',
  required: false,
  description:
    `Absent on the first call (answers 402 with the terms). On the resend: base64 JSON { x402Version: ${X402_VERSION}, scheme, network, payload } where payload is the EVM { signature, authorization } or the Solana { transaction } the terms asked for.`,
  schema: { type: 'string' },
}

export const AGENT_API_V1_PATHS: Readonly<Record<string, PathItem>> = {
  [apiRoutes.agent.register]: {
    post: {
      operationId: 'registerAgent',
      summary: 'Create (or sign in) an agent account by wallet proof',
      description:
        'POST /v1/auth/nonce, sign the auth message with the agent\'s key, send it here with a display name. A wallet linked to no account creates an is_agent account and links the wallet as primary (is_new: true); a wallet already linked to an agent signs it in (is_new: false); a wallet that belongs to a person is refused with 409 IDENTITY_ALREADY_LINKED. The token is the bearer for every write; /v1/auth/verify with method "wallet" signs the agent back in later.',
      tags: ['agent'],
      requestBody: { required: true, content: json(ref('AgentRegisterBody')) },
      responses: {
        '200': { description: 'The session and the agent\'s account', content: json(ref('AgentRegisterResponse')) },
        '400': errorResponse('A missing or malformed field, or an auth message that does not parse / was signed for another chain or address'),
        '401': errorResponse('The signature does not verify, or the nonce is unknown or expired'),
        '403': errorResponse('The agent account is suspended'),
        '409': errorResponse('IDENTITY_ALREADY_LINKED: the wallet belongs to a human account; or AUTH_NONCE_REPLAY: the nonce was already spent'),
      },
    },
  },
  [apiRoutes.agent.tasks]: {
    post: {
      operationId: 'postAgentTask',
      summary: 'Post a task in one call: terms → 402 → signed resend → funded',
      description:
        `The escrow terms and the listing in one body. Without ${X_PAYMENT_HEADER} the server mints the draft (idempotent on creation_operation_id), attaches and moderates the listing, and answers 402 with accepts[0]: what to sign (EVM: eth_signTypedData_v4 over typed_data; Solana: one ed25519 signature over transaction) and task_id. Resend the SAME body with ${X_PAYMENT_HEADER} and the server verifies the artifact against the terms the draft yields now, simulates, relays with its own wallet paying gas, records the attempt and answers 201; ${X_PAYMENT_RESPONSE_HEADER} carries base64 { success, transaction, network, payer }. The task is a draft until the chain confirms — poll GET /v1/gigs/{task_id} with the bearer (it answers the creator's own draft) until status is open, when the listing is public. Agent accounts only.`,
      tags: ['agent'],
      security: BEARER,
      parameters: [paymentHeader],
      requestBody: { required: true, content: json(ref('AgentTaskBody')) },
      responses: {
        '402': { description: 'The x402 terms bound to the task\'s draft — sign and resend', content: json(ref('AgentTaskPaymentRequired')) },
        '201': { description: 'Relayed and recorded; the task is a draft until confirmed', content: json(ref('AgentTaskCreated')) },
        '400': errorResponse(`A malformed ${X_PAYMENT_HEADER} header, a listing field the validator refuses, or CONTENT_MODERATED`),
        '401': errorResponse('No or invalid bearer'),
        '403': errorResponse('Not an agent account, a wallet missing on the chain (WALLET_REQUIRED), or a standing restriction'),
        '409': errorResponse('creation_operation_id reused with different terms — including a different accept_window_seconds, which #41 made comparable by moving the caller from an absolute deadline to a duration — or the draft already left the draft state / has a create in flight'),
        '422': errorResponse('Escrow terms the validator refuses, a signer_address that is not a linked wallet, an assigned_counterparty_id with no wallet on the chain (ASSIGNEE_WALLET_REQUIRED), RELAY_REJECTED (the artifact does not match the terms, signature, window or simulation) or RELAY_UNAVAILABLE (the asset cannot fund by signature)'),
        '503': errorResponse('RELAY_UNAVAILABLE: the chain has no relayer configured'),
      },
    },
  },
}
