import type { LinkedWallet, MeResponse, PublicUser, User } from '@tenda/shared'

/**
 * Fully-typed User row for tests and the e2e stub — typed against the REAL
 * shared row type so a schema change breaks the build here, not silently in
 * a fixture that stopped matching the wire.
 */
export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-test-1',
    first_name: 'Ada',
    last_name: 'Okafor',
    bio: null,
    avatar_url: null,
    country: 'NG',
    city: 'Lagos',
    latitude: null,
    longitude: null,
    role: 'user',
    status: 'active',
    is_seeker: false,
    is_agent: false,
    review_score: null,
    sponsored_tx_remaining: 3,
    advanced_mode_enabled: false,
    announcements_read_at: null,
    last_active_at: null,
    created_at: new Date('2026-08-01T10:00:00.000Z'),
    updated_at: new Date('2026-08-01T10:00:00.000Z'),
    ...overrides,
  }
}

/** GET /v1/users/me wire shape — the sole populator of the wallets[] trust list. */
export function makeMeResponse(wallets: LinkedWallet[]): MeResponse {
  return {
    user: {
      id: 'u1',
      first_name: 'Ada',
      last_name: 'Okafor',
      bio: null,
      avatar_url: null,
      country: null,
      city: null,
      phone_verified_at: null,
      role: 'user',
      is_seeker: false,
      advanced_mode_enabled: false,
      created_at: '2026-08-15T12:00:00.000Z',
    },
    wallets,
    profile_complete: true,
  }
}

export function makePublicUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: 'them',
    first_name: 'Ada',
    last_name: 'Okafor',
    bio: null,
    avatar_url: null,
    country: 'NG',
    city: 'Lagos',
    latitude: null,
    longitude: null,
    role: 'user',
    is_seeker: false,
    is_agent: false,
    review_score: null,
    phone_verified_at: null,
    created_at: new Date('2026-08-01T10:00:00.000Z'),
    ...overrides,
  }
}
