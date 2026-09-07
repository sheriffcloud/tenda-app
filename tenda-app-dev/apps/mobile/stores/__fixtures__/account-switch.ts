/**
 * The scaffolding every account-switch suite needs, in one place.
 *
 * These suites are split per store — each needs its own `jest.mock` block, and
 * one file carrying every mock set was 355 lines of setup — but they all turn
 * on the same trick: hold a response open, sign out, and only THEN let it land.
 * The trick belongs here; what each store does with it belongs in its own file.
 */
import { ApiClientError, ErrorCode } from '@tenda/shared'
import type { AuthResponse, IdentityMethodWire, MeUser } from '@tenda/shared'
import type { WalletAdapter } from '@/wallet/adapters/types'

/**
 * A promise the case resolves by hand, so a response can be made to arrive
 * strictly AFTER the sign-out — the ordering the guards exist for. A
 * pre-resolved mock cannot express it: the write would land before the clear,
 * and the case would pass just as happily against an unguarded store.
 */
export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/** Let every already-queued microtask and timer callback run. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

/** The rejection the auth store treats as "this token is dead". */
export function unauthorized(): ApiClientError {
  return new ApiClientError(401, 'Unauthorized', 'token expired', ErrorCode.UNAUTHORIZED)
}

/**
 * Narrowed the way `auth.store.test.ts` already narrows it: these cases turn on
 * WHETHER a user lands, never on which fields it carries, and spelling out a
 * whole profile would be a fixture that drifts for no assertion's sake.
 */
export function authUser(): AuthResponse['user'] {
  return { id: 'user-a', first_name: 'Ada', last_name: 'Lovelace' } as AuthResponse['user']
}

/**
 * Spelled out in full, unlike `authUser`: this one is typed by the mock itself
 * and the compiler refuses a partial — which is the point. The neighbouring
 * suite stubs `api.users.me` through an untyped `jest.Mock` and gets away with
 * three fields the server never sends alone.
 */
export function meUser(): MeUser {
  return {
    id:                    'user-a',
    first_name:            'Ada',
    last_name:             'Lovelace',
    bio:                   null,
    avatar_url:            null,
    country:               'NG',
    city:                  null,
    phone_verified_at:     null,
    role:                  'user',
    is_seeker:             false,
    advanced_mode_enabled: false,
    created_at:            '2026-08-15T12:00:00.000Z',
  }
}

export function identity(): IdentityMethodWire {
  return { kind: 'email', identifier: 'a@example.com', email: 'a@example.com', verified: true }
}

/** The store never inspects it; `walletSignIn` is mocked wholesale. */
export function walletAdapter(): WalletAdapter {
  return {} as WalletAdapter
}

/** The successful wallet sign-in the store expects back. */
export function walletResult(): {
  auth: AuthResponse & { is_new: boolean }
  account: { namespace: 'solana'; chainId: string; address: string; walletId: string }
} {
  return {
    auth:    { token: 'jwt-b', user: authUser(), is_new: false },
    account: { namespace: 'solana', chainId: 'solana:devnet', address: 'SoLaNa', walletId: 'w' },
  }
}
