import type { PublicUser } from '@tenda/shared'
import { abbreviatedName } from '@tenda/shared'
import { OTHER_USER_ID } from './chat'

const BOLA_PROFILE: PublicUser = {
  id: OTHER_USER_ID,
  display_name: abbreviatedName('Bola', 'Ade'),
  full_name: null,
  bio: null,
  avatar_url: null,
  country: 'NG',
  city: 'Lagos',
  role: 'user',
  is_seeker: false,
  is_agent: false,
  review_score: null,
  phone_verified_at: null,
  created_at: '2026-08-01T10:00:00.000Z',
}

/** Anonymous profile fixture; mirrors the real endpoint's strict default view. */
export function handleProfile(url: URL, method: string): PublicUser | null {
  return url.pathname === `/v1/users/${OTHER_USER_ID}` && method === 'GET'
    ? BOLA_PROFILE
    : null
}
