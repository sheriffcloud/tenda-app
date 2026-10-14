/**
 * Which client minted a session.
 *
 * A GENERIC session fact, not a feature flag. It records how a token came into
 * existence — the app, or the browser — which is useful for audit, for support
 * ("they were on web"), and for any surface that is legitimately app-only. The
 * first such surface is the gas-seed claim (#53c-1), but nothing here mentions
 * it and nothing here should: the moment this becomes "the gas-seed field", it
 * stops being safe to read anywhere else and starts being one more thing to
 * unpick when that feature is removed.
 *
 * The stamp is a CLAIM BY THE CLIENT, not a proof. A determined caller can send
 * whatever header they like, which is exactly why it is never the only gate on
 * anything that matters — the claim surface pairs it with a registered device
 * and a verified phone. It raises the cost of a scripted signup; it does not
 * pretend to be attestation.
 */

/** The header a client sends at sign-in to stamp its session. Lower-case: Node normalises. */
export const SESSION_CLIENT_HEADER = 'x-tenda-client'

/**
 * The clients that may stamp a session. An allowlist rather than a free string,
 * so nothing a caller invents is copied verbatim into a signed token.
 */
export const SESSION_CLIENTS = ['mobile', 'web'] as const

export type SessionClient = (typeof SESSION_CLIENTS)[number]

/**
 * Read a client stamp from a header value, or null if it is absent or unknown.
 *
 * Unknown reads as ABSENT rather than throwing: a stamp is optional, an older
 * app build sends none, and refusing a sign-in over a header nobody depends on
 * would turn a cosmetic mismatch into an outage.
 */
export function parseSessionClient(value: string | undefined): SessionClient | null {
  if (value === undefined) return null
  const found = SESSION_CLIENTS.find((client) => client === value)
  return found ?? null
}

/**
 * How long a DEMO agent session lives, in minutes (#177).
 *
 * SHARED, unlike the scope claim it travels with — that one lives server-side
 * in `apps/server/src/lib/auth/scope.ts` because a client never sends it and
 * never sees it. This number is different in kind: the published Agent API
 * document STATES it to readers, in words, on the demo-session operation. One
 * value, read by the mint that enforces it and by the sentence that promises
 * it, so the document cannot go on advertising a lifetime the server stopped
 * honouring. (The figure is deliberately NOT repeated in this comment — that
 * would be the very rot the constant exists to remove.)
 *
 * A count of MINUTES rather than a jwt duration string, so the prose and the
 * `expiresIn` argument are both derived and neither has to parse the other.
 *
 * Short on purpose: an ordinary session is written for a person's phone, and a
 * door that opens to anybody with no credential at all should not hand out a
 * week. Not a control by itself — re-minting is rate-limited, not forbidden —
 * but it bounds a token that leaks into a transcript, a log or a notebook.
 */
export const DEMO_TOKEN_LIFETIME_MINUTES = 30

/** The same lifetime as a jsonwebtoken `expiresIn` spec. */
export const DEMO_TOKEN_EXPIRES_IN = `${DEMO_TOKEN_LIFETIME_MINUTES}m`
