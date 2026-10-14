/**
 * Token SCOPE — what a bearer may reach, decided at mint time.
 *
 * ONE scope exists, and it exists for one reason. The demo session (#108) hands
 * a bearer to anybody who asks — no body, no proof, no account — so a reviewer
 * with no wallet can reach the 402 terms. Until this file that bearer was an
 * ORDINARY one: it reached every route behind `authenticate`, including the
 * exchange order book. MEASURED on production 2026-09-14: `GET /v1/exchange`
 * answered 401 anonymous and 200 to a demo bearer, returning three live offers,
 * each pairing a real person's name, avatar and country with the money they
 * were moving. The demo never needed that and the document never offered it.
 *
 * The line this enforces is the one the agent document already draws: "The read
 * surface (every GET) is anonymous. The write surface (POST /v1/agent/*) is
 * bearer-scoped." A demo caller therefore needs a bearer for the handful of
 * routes named in `DEMO_SCOPE_ROUTES` below and nothing else; the rest of what
 * it legitimately does, it does with no token at all. So this costs the demo
 * nothing — it withdraws an authority that was never part of it.
 *
 * Do not restate the COUNT here. Three separate sentences in this change said
 * "one endpoint" and went stale the moment a second route joined the list; the
 * list is the only place that may say how long it is.
 *
 * DENY BY DEFAULT. `DEMO_SCOPE_ROUTES` names what a demo token MAY reach, so a
 * gated route added later is out of reach without anyone remembering this
 * decision. That is precisely where the previous arrangement failed.
 *
 * Server-side, not shared: a client never sends this and never sees it. The
 * `client` claim beside it in the payload comes from a request header, and its
 * own docblock warns it is "NOT a security boundary on its own — a caller can
 * send any header". This one is asserted by the server and signed into the
 * token, so it IS one. Same optional-claim shape, opposite trust.
 */
import { apiRoutes } from '@tenda/shared'

/** The only scope. A token minted anywhere else carries none and is unrestricted. */
export const DEMO_SCOPE = 'demo'

export type TokenScope = typeof DEMO_SCOPE

/**
 * Every route a demo bearer may authenticate against.
 *
 * TWO, and adding a third should feel like a decision: the whole value here is
 * that the list is short enough to read, and `DEMO_SCOPE_REFUSAL` below names
 * whatever is in it rather than a sentence someone has to remember to update.
 *
 * `gigs.get` is the second, and it is NOT optional: it is the documented poll
 * target after a 402. The route is public and `identifyViewer`-gated for an OPEN
 * gig — but a DRAFT read runs `fastify.authenticate` MID-HANDLER (routes/v1/
 * gigs/_id/index.ts) so that suspended accounts are rejected there like
 * everywhere else, and an agent's freshly quoted task is always a draft. Listing
 * it grants the demo no more than its own drafts: the ownership check right
 * after that call still restricts a draft to its creator. Found by this
 * allow-list refusing the poll, which is the deny-by-default working.
 *
 * NOT in this list, deliberately:
 *   - `GET /v1/gigs` needs no entry for anonymous browsing, which sends no token
 *     at all. Its `?mine=` branch DOES call `authenticate` mid-handler, so a
 *     demo token is refused there — it cannot list its own drafts in bulk.
 *     Accepted: the documented poll is by id, and the refusal says where to get
 *     a real agent.
 */
export const DEMO_SCOPE_ROUTES: readonly string[] = [apiRoutes.agent.tasks, apiRoutes.gigs.get]

/**
 * Whether a token carrying `scope` may authenticate against `routeUrl`.
 *
 * An unscoped token — every ordinary session, including a REAL agent's from
 * `/v1/agent/register` — is unrestricted, which is the case the tests must pin:
 * this check has to discriminate, not blanket-deny agents.
 *
 * `routeUrl` is Fastify's registered pattern (`/v1/gigs/:id`), never the raw
 * URL, so a query string or a path parameter cannot widen the match.
 */
export function scopeAllows(scope: TokenScope | undefined, routeUrl: string | undefined): boolean {
  if (scope === undefined) return true
  if (routeUrl === undefined) return false
  return DEMO_SCOPE_ROUTES.includes(routeUrl)
}

/**
 * What to tell a caller whose demo token does not reach where it asked.
 *
 * DERIVED from the allow-list, not retyped beside it. The first version of this
 * said "may only call POST /v1/agent/tasks" and stayed that way when
 * `gigs.get` joined — telling a reviewer they could not make the very poll the
 * document tells them to make. A sentence that restates a list is a sentence
 * that outlives it.
 */
export const DEMO_SCOPE_REFUSAL = `this is a demo session and may only reach ${DEMO_SCOPE_ROUTES.join(' and ')} — register your own agent with POST ${apiRoutes.agent.register} for a full session`
