/**
 * The DEMO agent session (#108) — a bearer minted with no wallet proof.
 *
 * WHY IT EXISTS. Ten reviewers read the agent contract on 2026-09-05 and all
 * ten stopped at the same place: `POST /v1/agent/tasks` answers 401 to a
 * stranger, so nobody reached the 402 terms the document describes. Registering
 * properly needs a wallet signature, which a reviewer running a language model
 * does not have. This is the door: one shared, rate-limited agent account that
 * anybody can hold a token for.
 *
 * WHAT IT DELIBERATELY IS NOT. It is not a second implementation of the flow —
 * that was the earlier "anonymous 402" idea, abandoned on measurement: terms
 * are built FOR a specific wallet and a specific draft (`payment.creator`, a
 * nonce over the whole params, EIP-712 over both), and the relay refuses to
 * emit terms that would not hash to the token's live domain separator. With no
 * user there is no creator, so an anonymous quote would have to INVENT one and
 * hand out terms nobody can sign — drift built into the API, and worse than an
 * honest 401. A demo ACCOUNT has no drift by construction: it is the same code
 * path, with a real account on the end of it.
 *
 * WHAT IT CANNOT DO, and why that needs no extra machinery:
 *   - It cannot spend. Terms are built for `AGENT_DEMO_ADDRESS`; funding needs
 *     an EIP-3009 signature from the key behind that address, which the server
 *     does not hold and never asks for.
 *   - Nothing it posts reaches the public feed. A task is a DRAFT until a
 *     confirmed on-chain create moves it to `open`, and `publicGigConditions`
 *     requires `open`. No funding, no publication — that is the existing rule,
 *     not a special case added here.
 *   - It cannot lock itself out. The pending-gig cap counts gigs a worker has
 *     ACCEPTED or SUBMITTED and excludes drafts outright, so a shared account
 *     accumulating demo drafts never starts refusing the next reviewer.
 *   - It cannot fill the table either (#147). Nothing deletes drafts, so
 *     every review run used to leave one forever; the account now keeps a
 *     RING of its most recent unfunded drafts (`AGENT_DEMO_DRAFT_CAP`), the
 *     oldest going when a new one is minted — ./demoDraftRing.
 */
import { ErrorCode, apiRoutes, isEvmAddress } from '@tenda/shared'
import type { FastifyInstance } from 'fastify'
import { AppError } from '@server/lib/errors'
import { getConfig } from '@server/config'
import { findOrCreateAgentByWallet, type AgentRegistration } from '../register/registerAgent'

/**
 * The demo account's display name. Every surface that shows an agent shows this
 * beside the agent badge, so it says what it is rather than impersonating a
 * customer.
 */
export const DEMO_AGENT_NAME = 'Tenda Demo Agent'

/** A usable demo address, or the operator-facing reason there is none. */
export type DemoAddress = { ok: true; address: string } | { ok: false; reason: string }

/**
 * Whether this deployment can offer a demo at all, decided from the configured
 * value alone — pure, so every answer is covered without a process per case
 * (`getConfig()` memoises on first read, so the states cannot share one).
 *
 * The MALFORMED case earns its place beside the unset one. An unset address
 * fails at the door and says so; a typo'd address does not — the session is
 * minted, the account is created, and the failure surfaces later and elsewhere,
 * when the relay hands the address to a library that does check it. Guarding
 * here turns a deep, deployment-shaped failure into the same 503 the other
 * misconfigurations produce, at the moment the operator can still see why.
 */
export function demoAddress(configured: string | null): DemoAddress {
  if (configured === null) return { ok: false, reason: 'AGENT_DEMO_ADDRESS is unset' }
  // The shared validator, not a local regex — #104 found THREE copies of this
  // rule and folded them into one.
  if (!isEvmAddress(configured)) return { ok: false, reason: 'AGENT_DEMO_ADDRESS is not a 0x-hex EVM address' }
  return { ok: true, address: configured }
}

/**
 * Find-or-create the demo agent and hand it back for the route to mint a token
 * for. One account per deployment, keyed by its configured address, so repeat
 * callers share it (`is_new` is true exactly once, for the first caller ever).
 */
export async function demoAgentSession(fastify: FastifyInstance): Promise<AgentRegistration> {
  const configured = demoAddress(getConfig().AGENT_DEMO_ADDRESS)
  if (!configured.ok) {
    // Said plainly, because the alternative — inventing an address — is the
    // drift this design exists to avoid, and a reader who gets this back should
    // look at the deployment, not at their request.
    throw new AppError(
      503,
      ErrorCode.SERVICE_UNAVAILABLE,
      `demo access is not configured on this deployment (${configured.reason}) — register a real agent with POST ${apiRoutes.agent.register}`,
    )
  }
  try {
    return await findOrCreateAgentByWallet(fastify, {
      chain_ns: 'eip155',
      address: configured.address,
      name: DEMO_AGENT_NAME,
      country: null,
    })
  } catch (err) {
    // The shared find-or-create refuses a wallet a PERSON already holds. On the
    // registration path that is the caller's problem and its advice — sign in
    // through /v1/auth/verify — is the right advice. HERE the caller chose
    // nothing: the address is the deployment's, so the same refusal is a
    // configuration fault wearing a caller's error, and it would reach a
    // reviewer as an unexplained 409 at the one door built for them. Reachable
    // in practice, because an operator naturally reaches for an address they
    // control, and that is exactly the address their own account may hold.
    // Re-raised as the 503 an unset address gets: from outside, both mean
    // "no demo here", and both are fixed by an operator, not by the caller.
    if (err instanceof AppError && err.code === ErrorCode.IDENTITY_ALREADY_LINKED) {
      throw new AppError(
        503,
        ErrorCode.SERVICE_UNAVAILABLE,
        'demo access is misconfigured on this deployment: AGENT_DEMO_ADDRESS names a wallet that already belongs to a person\'s account — point it at an address no human account has linked, or unset it',
      )
    }
    throw err
  }
}
