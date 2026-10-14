/**
 * Where sign-in should put the reader back.
 *
 * `AuthGate` sends an anonymous visitor to /signin from wherever they were
 * heading, and before this the destination was simply lost — a deep link into
 * any (app) route landed on /home once they had signed in. #17 made that
 * sharper: /my-gigs/<escrowId> is the authed escrow view, so a link shared out
 * of the app stranded a recipient who already had an account.
 *
 * It rides in a SEARCH PARAM rather than the sign-in flow store, deliberately.
 * That store is in-memory on purpose (it holds the address someone typed, and
 * web must not put that in the URL), and a deep link is exactly the case where
 * the tab was opened fresh — there is no memory to survive.
 *
 * EVERY value here is attacker-supplied. A `?next=` that is not validated is
 * an open redirect: a link to our own sign-in page that lands the reader on
 * somebody else's, with our domain in the part of the URL they read. So this
 * module is a whitelist, not a blacklist — anything that is not recognisably
 * one of our own paths is refused and the caller falls back to /home.
 */

/** The query key. One constant, so the writer and the reader cannot drift. */
export const RETURN_PARAM = 'next'

/** Where sign-in lands when there is no valid destination to return to. */
export const DEFAULT_SIGNED_IN_PATH = '/home'

/**
 * Prefixes that are inside the sign-in flow itself.
 *
 * Not a security rule — these are our own paths. Returning to one is a LOOP:
 * finish signing in, get sent back to the step you just finished, sign in
 * again. `/onboarding` is here for the same reason, since the profile step
 * hands off to this same destination once it completes.
 */
const FLOW_PREFIXES = ['/signin', '/onboarding'] as const

/**
 * The attacker-supplied string as a path we are willing to navigate to, or
 * null.
 *
 * Refusals, and why each one is not covered by the one before it:
 *   • not starting with '/'  — an absolute URL ("https://evil.com") or a
 *     scheme ("javascript:alert(1)").
 *   • starting with '//'     — protocol-relative; the browser resolves
 *     "//evil.com" against the current scheme and leaves our origin.
 *   • a backslash second     — "/\evil.com" and "/\\evil.com" are normalised
 *     to the protocol-relative form by browsers, so the check above misses
 *     them if it only looks for a slash.
 *   • control characters     — "/\tevil" style padding that a URL parser
 *     strips before resolving, which would smuggle the forms above past a
 *     naive prefix test.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  // Control characters (tab, newline, NUL...) are STRIPPED by URL parsers
  // before resolution, so '/\tevil.com' would sail past the prefix checks
  // below and then resolve as protocol-relative. Refuse them outright.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null
  if (!raw.startsWith('/')) return null
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null
  if (FLOW_PREFIXES.some((prefix) => raw === prefix || raw.startsWith(`${prefix}/`))) return null
  return raw
}

/**
 * The destination out of a raw search-param value, validated.
 *
 * Next hands a repeated key through as an ARRAY, and nothing we write ever
 * produces one — so `?next=/safe&next=//evil.example` is a hand-built URL and
 * is refused outright rather than guessed at by taking one of them.
 */
export function readReturnParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return null
  return safeReturnPath(value ?? null)
}

/**
 * The destination in the CURRENT url, read at call time. Null on the server.
 *
 * Deliberately not `useSearchParams`: that opts a client page out of static
 * prerendering unless it is wrapped in Suspense, and a Suspense boundary
 * streams its content in behind a script — the same trap apps/web/CLAUDE.md
 * records for `loading.tsx` and `error.tsx`. It also failed the production
 * build outright on /onboarding/profile.
 *
 * Every caller wants this at NAVIGATION time — inside an event handler or an
 * effect — where `window` exists and no render depends on the value, so there
 * is nothing for the server and the client to disagree about.
 */
export function currentReturnPath(): string | null {
  if (typeof window === 'undefined') return null
  return safeReturnPath(new URLSearchParams(window.location.search).get(RETURN_PARAM))
}

/**
 * The destination worth carrying from the path the reader was on, or null.
 *
 * Nothing to carry when they were already heading for the default: someone who
 * deep-links to /home should get a clean `/signin`, not `/signin?next=%2Fhome`
 * — a param that reads as though it does something and does not.
 */
export function returnPathFrom(here: string): string | null {
  const safe = safeReturnPath(here)
  return safe === null || safe === '/' || safe === DEFAULT_SIGNED_IN_PATH ? null : safe
}

/**
 * Add the destination to one of our own hrefs, so the next step in the flow
 * carries it. Returns `href` untouched when there is nothing worth carrying,
 * which keeps the canonical URLs clean for the ordinary sign-in.
 */
export function withReturnPath(href: string, returnPath: string | null): string {
  if (returnPath === null) return href
  const separator = href.includes('?') ? '&' : '?'
  return `${href}${separator}${RETURN_PARAM}=${encodeURIComponent(returnPath)}`
}

/**
 * The path a completed sign-in should land on. Kept as one function so every
 * exit from the flow — OTP, wallet, and the onboarding step after either —
 * makes the same decision from the same validation.
 */
export function signedInDestination(returnPath: string | null): string {
  return safeReturnPath(returnPath) ?? DEFAULT_SIGNED_IN_PATH
}
