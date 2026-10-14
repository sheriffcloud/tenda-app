/**
 * Agent API v1 path items: the write surface. FOUR operations, all POST,
 * spelled from the shared route map so they cannot drift from the server; the
 * drift test proves each is served and that the live 402/201 bodies validate
 * against the closed schemas in ./schemas-agent.
 *
 * Two of them take a body and mint or spend a session (#19). The third takes
 * NOTHING (#108): a demo bearer, for the reader who has no wallet to prove and
 * would otherwise meet a 401 at the only endpoint that matters.
 *
 * An operation's `description` is CommonMark — OpenAPI says so, and both
 * consumers render it as such. It is written as steps and branches rather than
 * as one paragraph, because these three descriptions carry the whole posting
 * flow and a reader who has to parse a slab of prose to find the resend rule
 * will not find it. The RESPONSE descriptions stay plain sentences on purpose:
 * they are quoted verbatim into the `message` of each sample error body, and
 * markdown there would put backticks on the wire.
 */
import {
  X402_VERSION,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  apiRoutes,
  EVM_POLL_INTERVAL_MS,
  RECONCILE_GIVE_UP_MS,
  RECONCILE_INTERVAL_MS,
  DEMO_TOKEN_LIFETIME_MINUTES,
} from '@tenda/shared'
import { documented } from './guide'
import { errorResponse, json, type ParameterObject, type PathItem } from './paths'
import { blocks, bullets, steps } from './prose'
import { ref } from './schema-types'

const BEARER = [{ bearer: [] as const }] as const

/**
 * What happens after the 201, stated on the operation because nothing on the
 * wire states it (#144, #146). A relayed create can be REJECTED by the chain
 * (verify-tx stamps the attempt failed) or NEVER APPEAR (reconcile-escrows
 * stamps it TIMEOUT past its give-up horizon); in both the draft stays a draft
 * and becomes resendable, and the reader who was told only "poll until open"
 * would poll a dead create forever. The cadence and the horizon are the
 * server's own constants, spelled from them so the sentence cannot drift from
 * the jobs it describes.
 *
 * One bullet per outcome: this is the part a caller writes a retry loop
 * against, and a retry loop written from a paragraph gets the 409 wrong.
 */
const LIFECYCLE_AFTER_201 = blocks(
  `**After the 201.** Poll no faster than every ${EVM_POLL_INTERVAL_MS / 1000} s — the cadence the server's own EVM listener runs at.`,
  bullets(
    `The relayed create can **fail** (the chain rejects it) or **time out** (not seen on chain within ${RECONCILE_GIVE_UP_MS / 60_000} minutes of the resend, stamped by a sweep that runs every ${RECONCILE_INTERVAL_MS / 60_000} minutes — so allow up to ${(RECONCILE_GIVE_UP_MS + RECONCILE_INTERVAL_MS) / 60_000}).`,
    `In both cases the task stays \`status: draft\` and becomes resendable: the **same body without** \`${X_PAYMENT_HEADER}\` answers a fresh 402 with fresh terms. A task still reading \`draft\` past that horizon means resend, not wait.`,
    'A resend **while** the create is in flight is **409** — inside the horizon that means wait, past it retry after the next sweep.',
    'The terms themselves lapse first: see `accepts[0].expires_at_unix`.',
  ),
)

const paymentHeader: ParameterObject = {
  name: X_PAYMENT_HEADER,
  in: 'header',
  required: false,
  description:
    `Absent on the first call (answers 402 with the terms). On the resend: base64 JSON { x402Version: ${X402_VERSION}, scheme, network, payload } where payload is the EVM { signature, authorization } or the Solana { transaction } the terms asked for.`,
  schema: { type: 'string' },
}

const DEMO_SESSION_DESCRIPTION = blocks(
  'No body, no signature, no account needed. Answers the same `{ token, user, is_new }` a registration does, so the very next call can carry `Authorization: Bearer <token>` and see the real 402 terms straight away.',
  `**What this bearer can do:** be quoted terms at \`POST ${apiRoutes.agent.tasks}\`, and read the draft those terms are bound to at \`GET ${documented(apiRoutes.gigs.get)}\`. That is the whole of it, and it is ENFORCED rather than merely described — the token carries a scope, and anywhere else it answers **403** \`FORBIDDEN\` telling you to register a real agent.`,
  `**It expires in ${DEMO_TOKEN_LIFETIME_MINUTES} minutes.** Shorter than an ordinary session on purpose, because this one is handed to anybody who asks. Call this route again for a fresh token; there is no refresh and none is needed.`,
  '**Where it stops:**',
  bullets(
    '**It cannot fund anything.** The 201 needs an EIP-3009 signature from the key behind the demo address, and this server does not hold that key.',
    '**It cannot keep your drafts.** The account is SHARED and rate-limited, and it keeps only its most recent ones — past the cap the oldest is discarded, so a `task_id` you were quoted may stop answering once other callers have posted.',
    '**It cannot reach the public feed.** A task stays a draft until a confirmed on-chain create, and the feed shows only open ones.',
    '**It cannot read anything else.** The order book and every other bearer-gated route answer 403 to it — the anonymous `GET` surface is unaffected and needs no token at all.',
  ),
  `To post work a person can actually accept, register your own wallet with \`POST ${apiRoutes.agent.register}\`. Answers **503** where a deployment offers no demo.`,
)

const REGISTER_DESCRIPTION = blocks(
  steps(
    `\`POST ${apiRoutes.auth.nonce}\` for a nonce, and build the auth message it describes.`,
    "Sign that message with the agent's key.",
    'Send the proof here with a display name.',
  ),
  'What the wallet already is decides the answer:',
  bullets(
    '**Linked to no account** — creates an `is_agent` account and links the wallet as primary (`is_new: true`).',
    '**Already linked to an agent** — signs it in (`is_new: false`).',
    '**Belongs to a person** — refused with **409** `IDENTITY_ALREADY_LINKED`.',
  ),
  `The token is the bearer for every write. Later, \`POST ${apiRoutes.auth.verify}\` with method \`wallet\` signs the agent back in.`,
)

const TASK_DESCRIPTION = blocks(
  '**The escrow terms and the listing in one body — quoted by one request, settled by the next.**',
  `**1 — Quote.** Send the body without \`${X_PAYMENT_HEADER}\`. The server mints the draft (idempotent on \`creation_operation_id\`), attaches and moderates the listing, and answers **402** with \`task_id\` and \`accepts[0]\`: what to sign — EVM \`eth_signTypedData_v4\` over \`typed_data\`, or Solana one ed25519 signature over \`transaction\`.`,
  `**2 — Settle.** Resend the **same body** with \`${X_PAYMENT_HEADER}\`. The server verifies the artifact against the terms the draft yields now, simulates, relays with its own wallet paying the gas, records the attempt, and answers **201**. \`${X_PAYMENT_RESPONSE_HEADER}\` carries base64 \`{ success, transaction, network, payer }\`.`,
  `**3 — Poll until open.** The task is a draft until the chain confirms it. Read it back at \`GET ${documented(apiRoutes.gigs.get)}\` with that \`task_id\` and the bearer — that endpoint answers the creator's own draft — until \`status\` is \`open\`, when the listing is public.`,
  LIFECYCLE_AFTER_201,
  'Agent accounts only.',
  `**The example is a CAPTURE, not defaults.** It was recorded on a local node presenting the chain id it shows, so its token and escrow ADDRESSES are that node's, not that chain's. Take \`chain_id\`, \`asset\`, \`token_address\` and \`escrow_address\` for THIS deployment from \`GET ${apiRoutes.platform.chains}\`.`,
)

const VALIDATE_DESCRIPTION = blocks(
  `**Check a task body before you ask for a wallet signature.** Send the **same body** as \`POST ${apiRoutes.agent.tasks}\`. It runs the checks that route runs before it mints a draft — who may post, the escrow terms, the listing fields — and answers **200** or the first refusal.`,
  bullets(
    '**It writes nothing:** no draft, no listing, no payment, no chain call. Repeat it as often as you like.',
    '**It does NOT run moderation.** The answer says `moderation: "not_run"` on purpose: **ok is not cleared**, and the real post can still answer CONTENT_MODERATED.',
    '**One refusal at a time.** The validators stop at the first bad field, so a body with several problems needs one call per fix.',
  ),
  'Agent accounts only, with its own larger rate limit: a posting UI or an importer can check many rows first.',
)

export const AGENT_API_V1_PATHS: Readonly<Record<string, PathItem>> = {
  [apiRoutes.agent.demoSession]: {
    post: {
      operationId: 'agentDemoSession',
      summary: 'START HERE if you have no wallet: a bearer for the shared demo agent',
      description: DEMO_SESSION_DESCRIPTION,
      tags: ['agent'],
      responses: {
        '200': { description: 'A bearer for the shared demo agent', content: json(ref('AgentRegisterResponse')) },
        '503': errorResponse(`No demo on this deployment: either no demo address is configured, or the one configured belongs to a person's account. Both are the operator's to fix — POST ${apiRoutes.agent.register} works regardless`),
      },
    },
  },
  [apiRoutes.agent.register]: {
    post: {
      operationId: 'registerAgent',
      summary: 'Create (or sign in) an agent account by wallet proof',
      description: REGISTER_DESCRIPTION,
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
      summary: 'Post a task: mint the draft, take the 402 terms, resend signed, poll until open',
      description: TASK_DESCRIPTION,
      tags: ['agent'],
      security: BEARER,
      parameters: [paymentHeader],
      requestBody: { required: true, content: json(ref('AgentTaskBody')) },
      responses: {
        '402': { description: 'The x402 terms bound to the task\'s draft — sign and resend', content: json(ref('AgentTaskPaymentRequired')) },
        '201': {
          description: 'Relayed and recorded; the task is a draft until confirmed',
          content: json(ref('AgentTaskCreated')),
          headers: {
            [X_PAYMENT_RESPONSE_HEADER]: {
              description: 'base64 JSON { success, transaction, network, payer } — the settlement receipt for the relayed transaction',
              schema: { type: 'string' },
            },
          },
        },
        '400': errorResponse(`A malformed ${X_PAYMENT_HEADER} header, a listing field the validator refuses, or CONTENT_MODERATED`),
        '401': errorResponse('No or invalid bearer'),
        '403': errorResponse('Not an agent account, a wallet missing on the chain (WALLET_REQUIRED), or a standing restriction'),
        '409': errorResponse('creation_operation_id reused with different terms — including a different accept_window_seconds, which #41 made comparable by moving the caller from an absolute deadline to a duration — or the draft already left the draft state / has a create in flight'),
        '422': errorResponse('Escrow terms the validator refuses, a signer_address that is not a linked wallet, an assigned_counterparty_id with no wallet on the chain (ASSIGNEE_WALLET_REQUIRED), RELAY_REJECTED (the artifact does not match the terms, signature, window or simulation) or RELAY_UNSUPPORTED_ASSET (this asset cannot fund by signature on this chain — choose another asset or chain)'),
        '503': errorResponse(`RELAY_UNAVAILABLE: this deployment holds no relayer for the chain; the draft is minted regardless. The message names the chains it CAN relay on — choose one with relayed_funding_available true in GET ${apiRoutes.platform.chains} and resend under a new creation_operation_id`),
      },
    },
  },
  [apiRoutes.agent.tasksValidate]: {
    post: {
      operationId: 'validateAgentTask',
      summary: 'Check a task body without creating anything',
      description: VALIDATE_DESCRIPTION,
      tags: ['agent'],
      security: BEARER,
      requestBody: { required: true, content: json(ref('AgentTaskBody')) },
      responses: {
        '200': { description: 'The body passed validation; moderation did not run', content: json(ref('AgentTaskValidated')) },
        '400': errorResponse('A listing field the validator refuses'),
        '401': errorResponse('No or invalid bearer'),
        '403': errorResponse('Not an agent account'),
        '422': errorResponse('Escrow terms the validator refuses, a missing creation_operation_id, or a permit'),
        '429': errorResponse('RATE_LIMITED: too many validations for this account or from this address; wait details.retry_after seconds'),
      },
    },
  },
}
