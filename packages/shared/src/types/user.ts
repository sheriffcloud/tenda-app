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
 * Public profile projection. Excludes moderation state, activity tracking,
 * and private account prefs. `phone_verified_at` — the public "verified
 * human" trust signal — is no longer a `users` column (Stage 9A moved phone
 * into `user_identities`); the read routes derive it, so it is added back
 * here explicitly as a computed field.
 */
export type PublicUser = Omit<
  User,
  | 'updated_at'
  | 'status'
  | 'last_active_at'
  | 'sponsored_tx_remaining'
  | 'advanced_mode_enabled'
  | 'display_currency'
  | 'announcements_read_at'
> & {
  phone_verified_at: Date | null
}

/**
 * Minimal user projection embedded in listing/detail responses (gig +
 * exchange summaries, admin rows).
 */
export type UserRef = Pick<
  User,
  'id' | 'first_name' | 'last_name' | 'avatar_url' | 'review_score' | 'is_seeker' | 'country'
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
