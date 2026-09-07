/**
 * `/` decides where a signed-in user lands: the home tabs, or profile setup.
 *
 * The bug this pins (#47): the check was `Boolean(user.first_name &&
 * user.last_name)`, and `Boolean('  ' && '  ')` is `true`. A row holding two
 * spaces was therefore sent to home, then rendered "Anonymous" on every screen
 * and was refused by the server's create/accept guard on its first gig —
 * profile setup exists to prevent exactly that state, and this route skipped it.
 *
 * `hasCompleteName` is shared with the server, so the redirect and the guard
 * cannot disagree about the same row.
 */
import { render } from '@testing-library/react-native'

const mockRedirect = jest.fn()
jest.mock('expo-router', () => ({
  // Capture the href rather than navigating. Returning null keeps the tree
  // trivial — the assertion is about WHERE this route sends people.
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href)
    return null
  },
}))

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: { surface: { background: '#000' }, brand: { primary: '#fff' } },
    },
  }),
}))

import Index from '@/app/index'
import { useAuthStore } from '@/stores/auth.store'
import type { User } from '@tenda/shared'

const SIGNED_IN = { isAuthenticated: true, jwt: 'jwt-1', walletAuthInProgress: false }

/**
 * A complete `User` row. Spelled out rather than `{ id } as User`, which is what
 * the auth-store tests do — an assertion the compiler cannot check, so it keeps
 * compiling after the row gains a field and only fails if the code under test
 * happens to read it. Only the two name columns vary per test.
 */
function userRow(first_name: string, last_name: string): User {
  return {
    id: 'u-1',
    first_name,
    last_name,
    bio: null,
    avatar_url: null,
    country: null,
    city: null,
    latitude: null,
    longitude: null,
    role: 'user',
    status: 'active',
    is_seeker: false,
    review_score: null,
    sponsored_tx_remaining: 0,
    advanced_mode_enabled: false,
    display_currency: null,
    announcements_read_at: null,
    last_active_at: null,
    created_at: new Date(0),
    updated_at: new Date(0),
  }
}

/**
 * Sign a user in with the given name columns and no server answer yet.
 *
 * `profileComplete: null` is the case under test on purpose: it means
 * /v1/users/me has not replied, which is when `/` falls back to reading the
 * name columns itself. With a non-null value the route just echoes the server
 * and the local predicate is never exercised.
 */
function signInWith(first_name: string, last_name: string): void {
  useAuthStore.setState({ ...SIGNED_IN, profileComplete: null, user: userRow(first_name, last_name) })
}

beforeEach(() => {
  mockRedirect.mockReset()
})

test('a whitespace-only name is sent to profile setup, not home', () => {
  signInWith('  ', '  ')
  render(<Index />)
  expect(mockRedirect).toHaveBeenCalledWith('/(auth)/profile-setup')
})

test('a blank surname alone is still incomplete', () => {
  // Both parts are required — the same rule the server's guard applies. A
  // predicate built on `formatFullName(...) !== ''` would send this user home
  // and leave the API to refuse their first gig.
  signInWith('Ada', '   ')
  render(<Index />)
  expect(mockRedirect).toHaveBeenCalledWith('/(auth)/profile-setup')
})

test('a real name goes to home', () => {
  // The positive half: without it, a predicate stuck at `false` would satisfy
  // every other assertion here by always routing to setup.
  signInWith('Ada', 'Lovelace')
  render(<Index />)
  expect(mockRedirect).toHaveBeenCalledWith('/(tabs)/home')
})

test('the server answer wins over the local name check when it has arrived', () => {
  // `profileComplete ?? …` — a non-null value from /v1/users/me is
  // authoritative, and `??` (not `||`) is what keeps `false` meaningful rather
  // than falling through to the local guess.
  useAuthStore.setState({
    ...SIGNED_IN,
    profileComplete: false,
    user: userRow('Ada', 'Lovelace'),
  })
  render(<Index />)
  expect(mockRedirect).toHaveBeenCalledWith('/(auth)/profile-setup')
})
