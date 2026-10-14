import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'
import type { users, userStatusEnum } from '../db/schema'
import { userRoleEnum } from '../db/schema'

export type User = InferSelectModel<typeof users>
export type NewUser = InferInsertModel<typeof users>

export type UserRole = (typeof userRoleEnum.enumValues)[number]
export type UserStatus = (typeof userStatusEnum.enumValues)[number] // 'active' | 'suspended'

// All roles that grant admin panel access. Use this for role guards and
// permission checks. v2 collapsed the legacy role zoo (decision #17) to
// 'dispute_admin' + 'super_admin'.
export type AdminRole = Exclude<UserRole, 'user'>

export const ADMIN_ROLES: readonly AdminRole[] = userRoleEnum.enumValues.filter(
  (r): r is AdminRole => r !== 'user',
)

// Roles that can be assigned via PATCH /admin/users/:id/role.
export const ASSIGNABLE_ROLES: readonly UserRole[] = userRoleEnum.enumValues

/**
 * Public profile projection — an EXPLICIT list, not an `Omit` (#180).
 *
 * It was `Omit<User, ...six keys>` until this change, and subtraction is the
 * wrong direction for a projection that is served ANONYMOUSLY: every column
 * added to `users` landed here by default, and stayed until somebody
 * remembered to exclude it. That is how `latitude`/`longitude` came to be
 * published. Addition fails the other way — a new column is invisible until
 * someone puts it on this list, in a diff a reviewer reads.
 *
 * NAMES ARE SCOPED, and by the same rule the exchange detail uses (#175):
 * `display_name` is always the abbreviation, `full_name` and `avatar_url` are
 * null unless the viewer shares a SETTLED escrow with this person. One
 * vocabulary across both surfaces, so `scopedName` reads either.
 *
 * DROPPED, and stated so nobody restores them by reflex:
 *   - `latitude` / `longitude` — a home coordinate, unrounded, to anybody who
 *     asked. Zero consumers anywhere in web or mobile (measured, #180). Gig
 *     coordinates are a different thing and live on `gig_details`.
 *   - `first_name` / `last_name` — replaced by the two fields above, so a
 *     caller cannot rebuild the legal name from parts.
 *
 * KEPT deliberately: `role` (nothing renders it, but admin surfaces read the
 * type) and `phone_verified_at`, the "verified human" signal — a boolean fact
 * that reveals no number. It is derived per request, not a `users` column
 * (Stage 9A moved phone into `user_identities`).
 */
export type PublicUser = Pick<
  User,
  | 'id'
  | 'bio'
  | 'country'
  | 'city'
  | 'review_score'
  | 'role'
  | 'is_seeker'
  | 'is_agent'
> & {
  /** "Wisdom A." — `abbreviatedName`, or '' for a profile with no name set. */
  display_name: string
  /** Null unless the viewer shares a SETTLED escrow with this person. */
  full_name: string | null
  /** Null unless the viewer shares a SETTLED escrow with this person. */
  avatar_url: string | null
  phone_verified_at: string | null
  created_at: string
}

/**
 * Minimal user projection embedded in listing/detail responses (gig +
 * exchange summaries, admin rows).
 */
export type UserRef = Pick<
  User,
  'id' | 'first_name' | 'last_name' | 'avatar_url' | 'review_score' | 'is_seeker' | 'is_agent' | 'country'
>

export interface UpdateUserInput {
  first_name?: string
  last_name?: string
  avatar_url?: string
  bio?: string | null
  country?: string
  city?: string
  latitude?: number | null
  longitude?: number | null
}

export interface AuthResponse {
  token: string
  user: User
}
