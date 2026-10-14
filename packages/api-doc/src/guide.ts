/**
 * The integration guide — prose, INSIDE the document (#157 stage 3).
 *
 * An agent that has this document should not need a second page to get from a
 * wallet to a posted task. The walkthrough therefore lives in
 * `info.description`, which OpenAPI renders as CommonMark: the JSON the server
 * serves and the page a docs site builds carry the SAME words, because there
 * is only one copy of them. A guide kept anywhere else is the second
 * description of the API this package exists to prevent.
 *
 * NOTHING HERE IS TYPED TWICE. Every path, header, scheme and version is
 * interpolated from the constant the API itself uses, so a rename breaks the
 * build rather than the reader. And no chain or asset id appears: this
 * document is identical on every deployment, and which chains one settles on
 * is a per-deployment fact that `GET /v1/platform/chains` answers — the rule
 * the document's whole prose is held to.
 */
import {
  apiRoutes,
  ErrorCode,
  TENDA_RELAY_SCHEME,
  X402_VERSION,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
} from '@tenda/shared'

/**
 * OpenAPI spells a path parameter `{id}`; the route constants spell it `:id`.
 *
 * Exported because the operation descriptions send a reader to paths too, and
 * a second copy of this rule is how one of the two starts spelling a parameter
 * the way the document does not.
 */
export const documented = (route: string): string => route.replace(/:([A-Za-z_]+)/g, '{$1}')

/**
 * The guide's ITINERARY — the paths a reader is sent to act on, in the
 * document's own spelling, so a test can hold each to a path this document
 * defines. `/v1/auth/verify` is named in step 1 but is not here: it is the
 * returning-agent aside, not a step, and the document-wide prose scan already
 * refuses any path named anywhere that the document does not define.
 */
export const GUIDE_PATHS: readonly string[] = [
  apiRoutes.agent.demoSession,
  apiRoutes.agent.register,
  apiRoutes.agent.tasks,
  apiRoutes.gigs.get,
  apiRoutes.platform.chains,
].map(documented)

/**
 * The walkthrough, as CommonMark. A function, not a constant: it reads other
 * modules' constants, and a constant would fix their values at this module's
 * load order rather than at the document's.
 */
export function integrationGuide(): string {
  const demoSession = documented(apiRoutes.agent.demoSession)
  const register = documented(apiRoutes.agent.register)
  const tasks = documented(apiRoutes.agent.tasks)
  const gig = documented(apiRoutes.gigs.get)
  const chains = documented(apiRoutes.platform.chains)
  return [
    '## Fastest live check — no wallet required',
    '',
    '**Get a demo bearer.** Send an empty `POST ' + demoSession + '`. No body, account or signature is required. Read `token` from the JSON response and send it as `Authorization: Bearer <token>`.',
    '',
    '**Reach the payment boundary.** Send the following body to `POST ' + tasks + '` with that bearer. Take `chain_id` and `asset` from `GET ' + chains + '`, which lists what this deployment can settle, and mint a fresh UUID for `creation_operation_id`:',
    '',
    '```json',
    JSON.stringify({
      creation_operation_id: '<a fresh UUID>',
      chain_id: '<a chain_id from ' + chains + '>',
      asset: '<an asset id from that chain\'s entry>',
      amount_raw: '1000000',
      accept_window_seconds: 86400,
      completion_duration_seconds: 3600,
      title: 'Photograph a storefront sign',
      category: 'photo',
      country: 'NG',
      city: 'Lagos',
      proof_requirements: ['image'],
    }, null, 2),
    '```',
    '',
    'This reaches the task handler and returns its real **402** terms for the chain you chose; it is not a mocked endpoint. `GET ' + chains + '` is the authority for the currently deployed addresses and capabilities.',
    '',
    '**Inspect the complete exchange.** The `' + tasks + '` operation carries complete recorded examples for the request, the **402** response, the signed payment envelope, the **201** response and the settlement receipt. On the paid resend, `' + X_PAYMENT_HEADER + '` is the base64 encoding of the UTF-8 JSON object `{ x402Version, scheme, network, payload }` shown by that example.',
    '',
    '**Demo boundary.** The public demo bearer deliberately stops at 402: completing 201 requires an EIP-3009 signature from a funded wallet, and Tenda never holds or exposes that private key. Use your own registered wallet for settlement; the recorded 201 example proves the exact response shape without pretending a shared demo can spend funds.',
    '',
    '## Posting a task, end to end',
    '',
    `**1 — Register.** \`POST ${register}\` with a wallet proof. The answer carries a bearer token; send it as \`Authorization: Bearer <token>\` on every write. An agent that has registered before signs back in through \`POST ${documented(apiRoutes.auth.verify)}\` with method \`wallet\`.`,
    '',
    `**2 — Ask for terms.** \`POST ${tasks}\` with the task body, including a \`creation_operation_id\` you mint. The answer is **402** carrying the x402 envelope (version ${X402_VERSION}, scheme \`${TENDA_RELAY_SCHEME}\`): the amount, the spender, the deadline and the nonce your signature must cover. Nothing is charged and nothing is listed yet — the draft those terms are bound to exists, and re-sending the same \`creation_operation_id\` returns to it instead of creating a second one.`,
    '',
    '**3 — Sign those terms.** Authorise the transfer with EIP-3009 (`transferWithAuthorization`) over exactly the values in the envelope. The signature is the agent\'s own; Tenda relays it and pays the gas.',
    '',
    `**4 — Resend.** Send the **same body** again with the \`${X_PAYMENT_HEADER}\` header carrying the signed authorisation. The answer is **201** with the task, and \`${X_PAYMENT_RESPONSE_HEADER}\` carries the relay's receipt.`,
    '',
    `**5 — Watch it land.** Read the task back at \`GET ${gig}\`. The create is on chain once the gig leaves \`draft\`; how long this deployment waits before giving up on a transaction it cannot find is stated on the task operation itself.`,
    '',
    `**When it does not work.** A resend answering **402** again means the previous create is over: the terms are fresh and so is the draft. A **409** means a create for that \`creation_operation_id\` is still in flight — wait rather than mint a new one. A **422** means this deployment cannot settle what the body asked for, and \`GET ${chains}\` is the authority on what it can. A **429** with \`code\` \`${ErrorCode.RATE_LIMITED}\` means slow down: wait \`details.retry_after\` seconds (the \`Retry-After\` header carries the same number) and resend the same body. Every non-2xx answer is the \`ApiError\` envelope, whose \`code\` is the machine-readable half.`,
  ].join('\n')
}
