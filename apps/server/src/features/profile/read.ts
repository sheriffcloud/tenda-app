/**
 * The public profile projection, and the one question it turns on (#180).
 *
 * A sibling of `exchange-read.ts` and built the same way, deliberately: one
 * serializer that NAMES every field it copies, so a column added to `users`
 * later cannot reach an anonymous caller by inheritance. `PublicUser` was an
 * `Omit` until #180, and that is exactly how `latitude`/`longitude` came to be
 * published — subtraction leaks by default, addition does not.
 *
 * The identity rule is the SAME one the exchange detail uses, restated for a
 * surface that holds no escrow: there, "may I see this person" means "am I a
 * settled party to THIS escrow"; here it means "do we share a settled escrow at
 * all". Same line, same reason — you learn someone's legal name by trading with
 * them, not by typing their id.
 */
import { and } from 'drizzle-orm'
import { escrows, users } from '@tenda/shared/db/schema'
import { abbreviatedName, formatFullName } from '@tenda/shared'
import type { PublicUser, User } from '@tenda/shared'
import { isEscrowParty } from '@server/lib/escrow/party'
import type { AppDatabase } from '@server/plugins/db'

/**
 * Every column the profile reads. `first_name`/`last_name` are INPUTS to the
 * serializer, never wire fields — `toPublicUser` is the only thing that sees
 * them, and it emits a label rather than the parts.
 */
export const PROFILE_COLS = {
  id: users.id,
  first_name: users.first_name,
  last_name: users.last_name,
  avatar_url: users.avatar_url,
  bio: users.bio,
  country: users.country,
  city: users.city,
  review_score: users.review_score,
  role: users.role,
  is_seeker: users.is_seeker,
  is_agent: users.is_agent,
  created_at: users.created_at,
}

/**
 * What `PROFILE_COLS` selects. Spelled from `User` rather than derived from the
 * column map: the derivation was unreadable, and drift is caught anyway — the
 * route hands its select result straight to `toPublicUser`, so a column that
 * appears in one list and not the other fails to compile there.
 */
export type ProfileRow = Pick<
  User,
  | 'id'
  | 'first_name'
  | 'last_name'
  | 'avatar_url'
  | 'bio'
  | 'country'
  | 'city'
  | 'review_score'
  | 'role'
  | 'is_seeker'
  | 'is_agent'
  | 'created_at'
>

/**
 * May `viewerId` see `targetId`'s legal name and face?
 *
 * Three rules in one place so no caller can implement two of them:
 *   - anonymous never may;
 *   - you always may see yourself (and it costs no query);
 *   - otherwise only if a SETTLED escrow joins the two of you.
 *
 * The escrow arm reuses `isEscrowParty`, the same SQL builder the escrow routes
 * use, so "settled party" means one thing across the server. `and(...)` of the
 * two is exactly "both are settled parties to the same row", which for two
 * DIFFERENT people can only mean one is creator and the other counterparty —
 * and the self case never reaches it, which matters, because `and(p(a), p(a))`
 * would match every escrow `a` has ever been in.
 */
export async function mayRevealIdentity(
  db: AppDatabase,
  viewerId: string | null,
  targetId: string,
): Promise<boolean> {
  if (viewerId === null) return false
  if (viewerId === targetId) return true
  const [shared] = await db
    .select({ id: escrows.id })
    .from(escrows)
    .where(and(isEscrowParty(viewerId), isEscrowParty(targetId)))
    .limit(1)
  return shared !== undefined
}

/**
 * A profile row as a given viewer may see it.
 *
 * `full_name` is `formatFullName`'s answer so a person with no name set reads
 * as `''` rather than `'null null'` — and `null` when withheld, which is what
 * tells a client "not yours to see" apart from "this person has no name". The
 * same distinction `ExchangePartyRef` draws, on purpose.
 */
export function toPublicUser(
  row: ProfileRow,
  revealIdentity: boolean,
  phone_verified_at: Date | null,
): PublicUser {
  return {
    id: row.id,
    display_name: abbreviatedName(row.first_name, row.last_name),
    full_name: revealIdentity ? formatFullName(row.first_name, row.last_name) : null,
    avatar_url: revealIdentity ? row.avatar_url : null,
    bio: row.bio,
    country: row.country,
    city: row.city,
    review_score: row.review_score,
    role: row.role,
    is_seeker: row.is_seeker,
    is_agent: row.is_agent,
    created_at: row.created_at.toISOString(),
    phone_verified_at: phone_verified_at?.toISOString() ?? null,
  }
}
