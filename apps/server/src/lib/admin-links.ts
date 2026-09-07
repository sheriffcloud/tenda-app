/**
 * Links INTO the admin dashboard — the one place this server knows what
 * apps/admin's routes look like.
 *
 * That knowledge crosses an app boundary, so it must not be spread: a path
 * string built inline in a Slack message, again in an email, and again in a
 * future channel is three places to fix when the dashboard renames a route, and
 * the ones nobody fixes become dead links in an operator's inbox — noticed only
 * when someone finally clicks one.
 *
 * Every function here returns null when `ADMIN_DASHBOARD_URL` is not set. That
 * is a NORMAL state, not an error (config.ts: "null = the alert still sends,
 * without a link"), and the same posture `resolveSlackDestination` takes: an
 * optional integration going missing must never fail the notice it decorates.
 */

import { ADMIN_DASHBOARD_URL_ENV, BASE_URL_PROTOCOLS } from '@server/config'
import { isAbsoluteUrl, optionalEnv } from '@server/lib/env'

const TRAILING_SLASHES = /\/+$/

/**
 * A base that a path can safely be APPENDED to, or null.
 *
 * Every case below boots clean today — `isAbsoluteUrl` and the boot check both
 * accept them — and every one produces a link that 404s, discovered only when a
 * mediator finally clicks it. String concatenation cannot fix them; this parses:
 *
 *   …app//        → `stripTrailingSlash` removes exactly ONE by design ("'//' is
 *                   a caller error, not something to silently normalise away",
 *                   pinned by test/unit/env.test.ts). That rule is right for
 *                   `API_BASE_URL`, which is string-COMPARED against a signed
 *                   auth message, and wrong for a value that gets a path glued
 *                   to it. Not changed there; handled here.
 *   …app/?x=1     → appending yields `…/?x=1/disputes/<id>`: the path lands
 *                   INSIDE the query string.
 *   …app/#f       → same, inside the fragment.
 *
 * Rebuilding from a parsed URL handles all three at once, and `url.href` is used
 * rather than `url.origin` so basic-auth credentials in the value survive —
 * `origin` silently drops them. `new URL` cannot throw here: `isAbsoluteUrl`
 * above has already parsed the same string.
 */
function appendableBase(value: string): string {
  const url = new URL(value)
  // Dropped rather than rejected: the operator's intent is unambiguous, and a
  // correct link beats no link. Neither belongs on a base URL.
  url.search = ''
  url.hash = ''
  return url.href.replace(TRAILING_SLASHES, '')
}

/**
 * The dashboard's base URL from a GIVEN environment, normalised, or null.
 *
 * Reads `env` rather than the cached `getConfig()` on purpose: an alert channel
 * is handed `deps.env` precisely so `configured()` and `deliver()` read one
 * source (see AlertDeps), and a link built from a different source than the
 * check that gated it is the drift that threading exists to prevent.
 *
 * Malformed values return null rather than throwing, whereas `loadConfig`
 * refuses to boot on the same value. That asymmetry is deliberate, not a
 * disagreement: boot is where an operator's typo must be loud, and because it
 * IS loud there, a malformed value can never reach this function in a running
 * deployment. Should one ever arrive, degrading to an unlinked alert beats
 * failing a job that would otherwise have delivered.
 */
export function adminDashboardBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = optionalEnv(ADMIN_DASHBOARD_URL_ENV, env)
  if (value === null || !isAbsoluteUrl(value, BASE_URL_PROTOCOLS)) return null
  // For every well-formed value this agrees exactly with `config.ADMIN_DASHBOARD_URL`.
  // The two differ only on values that are absolute but not APPENDABLE — see
  // `appendableBase` — where this one is stricter because it is the side that
  // actually builds links.
  return appendableBase(value)
}

/**
 * Dispute detail, routed by DISPUTE id — not escrow id. apps/admin's
 * `(dashboard)/disputes/[id]/page.tsx` reads the param as the dispute and
 * derives the escrow from its summary, so an escrow id here 404s.
 */
const DISPUTE_PATH = '/disputes'

/**
 * Deep link to one dispute, or null when the dashboard URL is unset.
 *
 * The id is percent-encoded. It is a UUID from our own database today, so
 * nothing needs escaping — but this builds a URL from a value it did not
 * generate, and encoding at the point of interpolation is what keeps that true
 * if the identifier ever changes shape.
 */
export function adminDisputeUrl(
  dispute_id: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const base = adminDashboardBaseUrl(env)
  return base === null ? null : `${base}${DISPUTE_PATH}/${encodeURIComponent(dispute_id)}`
}
