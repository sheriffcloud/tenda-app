/**
 * Server operational facts the PUBLISHED agent document quotes.
 *
 * Five numbers and a shape that used to live in `apps/server/src`, imported by
 * the document builder so it could state real values rather than prose ("a few
 * minutes", "a short-lived nonce"). That coupling was the one thing keeping the
 * builder inside the server: everything else it reads is already shared
 * (#157). They live here so ONE document can be built by the server and by the
 * docs site, from the same values, with no server import in either.
 *
 * The server still owns the BEHAVIOUR each one describes — the listener that
 * polls, the job that reconciles, the nonce that expires — and imports these
 * constants rather than re-declaring them, so the document cannot quote a
 * number the deployment does not use.
 *
 * WHAT BELONGS HERE: a value the document publishes AND the server enforces.
 * Not a general dumping ground for server constants — an operational number
 * nobody publishes has no reason to leave the module that uses it.
 */
import { identityKindValues, type IdentityKind } from '../db/schema/identity'

/** How many gigs the featured rail carries. Published in the feed's schema. */
export const FEATURED_RAIL_LIMIT = 10

/** EVM listener cadence. Same as Solana's; block time never beats it usefully. */
export const EVM_POLL_INTERVAL_MS = 15_000

/**
 * How often the reconcile sweep runs, and the age at which it gives up on an
 * attempt it cannot find on chain. The document states BOTH, because a timeout
 * is stamped at the first tick at or after the give-up age: "resendable"
 * arrives up to one tick later than the horizon alone would say.
 */
export const RECONCILE_INTERVAL_MS = 5 * 60_000
export const RECONCILE_GIVE_UP_MS = 30 * 60_000

/** A login method on the generic auth routes. `IdentityKind` ∪ wallet. */
export type AuthMethod = IdentityKind | 'wallet'

/** Every method `GET /v1/auth/methods` can name, in the document's enum. */
export const AUTH_METHODS: readonly AuthMethod[] = [...identityKindValues, 'wallet']

/** How long a server-issued auth nonce stays valid. */
export const NONCE_TTL_SECONDS = 300

/**
 * 256 bits base64url-encoded with no padding is exactly 43 characters. The
 * validator and the schema a reader signs against are the same pattern, so
 * they cannot disagree (#130).
 */
export const NONCE_FORMAT = /^[A-Za-z0-9_-]{43}$/
