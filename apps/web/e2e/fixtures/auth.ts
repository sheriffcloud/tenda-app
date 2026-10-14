import type { MeUser, User } from '@tenda/shared'
import { makeUser } from '../../test/factories/user'

/**
 * Deterministic auth world for e2e. One always-valid code; two personas:
 * an EXISTING user with a complete profile, and any other email creates a
 * FRESH user with empty names (→ onboarding). Mutable on purpose — the
 * profile step PATCHes names and later assertions must see them.
 */
export const E2E_OTP_CODE = '123456'
export const EXISTING_EMAIL = 'ada@tenda.test'
/**
 * A third persona: complete profile AND the CO4 advanced-mode toggle on, which
 * is what unlocks the exchange surface.
 *
 * Its own account rather than a flag flipped on the shared one — the stub
 * serves every spec file at once, and a global toggle set by one of them is a
 * different app for whichever spec happens to be running beside it.
 */
export const TRADER_EMAIL = 'trader@tenda.test'
export const TRADER_USER_ID = 'user-trader'
/**
 * The id the stub mints for that account. Exported because the chat and
 * dispute fixtures scope their rows to the CALLER, and a second copy of this
 * string is how a fixture silently serves nobody (or everybody).
 */
export const EXISTING_USER_ID = 'user-existing'

interface AuthWorld {
  usersByToken: Map<string, User>
  nextId: number
}

export function createAuthWorld(): AuthWorld {
  return { usersByToken: new Map(), nextId: 1 }
}

export function signIn(world: AuthWorld, identifier: string): { token: string; user: User; is_new: boolean } {
  const existing = identifier === EXISTING_EMAIL
  const trader = identifier === TRADER_EMAIL
  const user = trader
    ? makeUser({
        id: TRADER_USER_ID,
        first_name: 'Tunde',
        last_name: 'Bello',
        advanced_mode_enabled: true,
      })
    : existing
      ? makeUser({
          id: EXISTING_USER_ID,
          first_name: 'Ada',
          last_name: 'Okafor',
          // A rated account, so the profile's rating line has both halves to
          // show: the average AND the count it is an average OF.
          review_score: '4.80',
        })
      : makeUser({ id: `user-fresh-${world.nextId++}`, first_name: '', last_name: '' })
  const token = `e2e-jwt-${user.id}`
  world.usersByToken.set(token, user)
  // Both named personas are returning accounts; only an unrecognised address
  // mints a new one and lands on onboarding.
  return { token, user, is_new: !existing && !trader }
}

export function userForBearer(world: AuthWorld, authorization: string | undefined): User | null {
  if (authorization === undefined || !authorization.startsWith('Bearer ')) return null
  return world.usersByToken.get(authorization.slice('Bearer '.length)) ?? null
}

/** The wire projection PATCH/GET /v1/users/me serves (ISO dates, no wallet). */
export function toMeUser(user: User): MeUser {
  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    bio: user.bio,
    avatar_url: user.avatar_url,
    country: user.country,
    city: user.city,
    phone_verified_at: null,
    role: user.role,
    is_seeker: user.is_seeker,
    advanced_mode_enabled: user.advanced_mode_enabled,
    created_at: user.created_at.toISOString(),
  }
}
