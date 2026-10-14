import { create } from 'zustand'
import {
  accountGeneration,
  ApiClientError,
  beginAccountSession,
  clearAccountState,
  ErrorCode,
  hasCompleteName,
  isSameAccount,
  withRetry,
} from '@tenda/shared'
import {
  getJwtToken,
  setJwtToken,
  getWalletAddress,
  setWalletAddress,
  clearAuthStorage,
} from '@/lib/secure-store'
import { api } from '@/api/client'
import { usePendingSyncStore } from '@/stores/pending-sync.store'
import { reconcileWalletState, isRetriableMeError } from '@/stores/wallet-sync'
import { signInWithWallet as walletSignIn, linkWalletWith } from '@/wallet/auth'
import { isSeekerDevice } from '@/lib/device'
import { connectionSignal } from '@/wallet/reown/connection-signal'
import type { AuthState } from '@/stores/auth.types'

/**
 * A SIGN-IN call answered 401 UNAUTHORIZED, only the server's JWT guard mints
 * that code, so a dead stored token leaked onto the request. Purge it so the
 * very next attempt starts clean: loadSession can only clear it when the
 * server is reachable at launch, so without this a server-down start leaves
 * sign-in permanently poisoned within the session.
 */
async function purgeIfStaleSession(e: unknown, gen: number): Promise<void> {
  // Only for the session that made the request: landed after someone else has
  // signed in, this wipes THEIR credentials and drops them to welcome (#65).
  if (!isSameAccount(gen)) return
  if (e instanceof ApiClientError && e.statusCode === 401 && e.code === ErrorCode.UNAUTHORIZED) {
    await clearAuthStorage()
    useAuthStore.setState({ jwt: null, walletAddress: null, isAuthenticated: false })
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  jwt: null,
  walletAddress: null,
  evmAddress: null,
  isAuthenticated: false,
  isLoading: true,
  walletAuthInProgress: false,
  wallets: [],
  walletsStatus: 'idle',
  profileComplete: null,
  identities: [],

  signInWithWallet: async (adapter) => {
    const gen = accountGeneration()
    // Flag the in-flight sign-in so `index` holds a spinner instead of flashing
    // welcome if the wallet's `tenda://` return bounces through `/` mid-verify.
    set({ walletAuthInProgress: true })
    try {
      const result = await walletSignIn(adapter).catch(async (e: unknown) => {
        await purgeIfStaleSession(e, gen)
        throw e
      })
      if (result === null) return false

      const { auth, account } = result
      const isSolana = account.namespace === 'solana'
      await Promise.all([
        setJwtToken(auth.token),
        // walletAddress is consumed as a Solana pubkey (balance, fiat quotes),
        // only persist it for a Solana account; an EVM login publishes evmAddress.
        isSolana ? setWalletAddress(account.address) : Promise.resolve(),
      ])
      // A new account owns the in-memory state from here. Nothing is left to
      // clear, but the generation must move so a request issued during the
      // signed-out window cannot write into this session (#65).
      beginAccountSession()
      set({
        user: auth.user,
        jwt: auth.token,
        ...(isSolana
          ? { walletAddress: account.address }
          : { evmAddress: account.address }),
        isAuthenticated: true,
        // The auth response is the v2 row, same predicate the server uses —
        // literally the same function now, so it cannot drift.
        profileComplete: hasCompleteName(auth.user.first_name, auth.user.last_name),
      })

      // Settle the legacy /v1/auth/me user shape (wallet_address etc.) and
      // wallets[] + phone state in the background; navigation only needs
      // profileComplete, already set above.
      void get().refreshUser()
      void get().refreshMe()
      return true
    } finally {
      set({ walletAuthInProgress: false })
    }
  },

  linkWallet: async (adapter) => {
    // Same in-flight flag as sign-in: the link's `tenda://` auto-return routes
    // through `/`, where `index` would otherwise redirect this authed user home
    // and pop the linked-wallets screen mid-link. Hold the spinner instead.
    set({ walletAuthInProgress: true })
    try {
      const account = await linkWalletWith(adapter)
      if (account === null) return false
      // Reflect the freshly-linked wallet in the cached wallets[] list.
      await get().refreshMe()
      return true
    } finally {
      set({ walletAuthInProgress: false })
    }
  },

  signInWithVerify: async (body) => {
    const gen = accountGeneration()
    // Account-creating methods carry the device-derived Seeker bootstrap:
    // is_seeker is the Solana Seeker DEVICE fee-tier flag (seeker_fee_bps),
    // read by the server only when INSERTing a new user — it is never a user
    // preference. The wallet method is find-or-reject (decision #3, never
    // creates), so it sends no bootstrap.
    const payload = body.method === 'wallet' ? body : { ...body, is_seeker: isSeekerDevice() }
    const res = await api.auth.verify(payload).catch(async (e: unknown) => {
      await purgeIfStaleSession(e, gen)
      throw e
    })
    await setJwtToken(res.token)
    // As in the wallet path: the account transition moves the generation.
    beginAccountSession()
    set({
      user: res.user,
      jwt: res.token,
      isAuthenticated: true,
      // Same profile-complete predicate the server uses.
      profileComplete: hasCompleteName(res.user.first_name, res.user.last_name),
    })
    // Settle wallets[] + phone state in the background; navigation only needs
    // profileComplete, already set above.
    void get().refreshMe()
    return { isNew: res.is_new }
  },

  linkIdentity: async (body) => {
    // `link: true` attaches the stored JWT → the server links this verified
    // identity to the current user (rather than creating/logging in). We discard
    // the returned token: the existing session is still valid and we must not
    // disturb the auth/nav state from a settings action.
    await api.auth.verify(body, { link: true })
    // Reflect the new contact across the surfaces that show it.
    await Promise.all([get().refreshMe(), get().loadMethods()])
    void get().refreshUser()
  },

  loadMethods: async () => {
    // `identities` is how THIS account signs in — linked email, phone, wallets.
    // A late response puts one person's methods on the next person's screen.
    const gen = accountGeneration()
    try {
      const res = await api.auth.methods()
      if (!isSameAccount(gen)) return
      set({ identities: res.identities })
    } catch {
      // Non-fatal, the security screen shows a retry; stale list is acceptable.
    }
  },

  logout: async () => {
    // Every store that declared itself account-scoped, in one call. This used
    // to be a hand-written list naming only `notifications`, which is exactly
    // how chat, gigs and escrow were never in it: the place you had to remember
    // was nowhere near the file you were writing (#65). Screen-local state
    // needs no entry — the exchange order book unmounts with its tab.
    clearAccountState()
    // Explicit, because its clear is asynchronous: it also empties two
    // persisted SecureStore keys, and the registry runs resets synchronously.
    await usePendingSyncStore.getState().clear()
    // Drop any WalletConnect (EVM) session so the next login starts clean and
    // shows the wallet sheet instead of silently reusing the prior wallet.
    // Fire-and-forget, logout must not block on a relay round-trip.
    void connectionSignal.disconnect()
    await clearAuthStorage()
    set({
      user: null,
      jwt: null,
      walletAddress: null,
      evmAddress: null,
      isAuthenticated: false,
      wallets: [],
      walletsStatus: 'idle',
      profileComplete: null,
      identities: [],
    })
  },

  loadSession: async () => {
    // Boot is not exempt: a reader can reach welcome and sign in while this
    // read is still out, and it restores a WHOLE session.
    const gen = accountGeneration()
    // Declare outside try so the catch block can reference them.
    // If the SecureStore read itself fails, both remain null and the catch
    // will set isLoading: false with no credentials, safe default.
    let jwt: string | null = null
    let walletAddress: string | null = null

    try {
      const stored = await Promise.all([getJwtToken(), getWalletAddress()])
      jwt           = stored[0]
      walletAddress = stored[1]

      if (!isSameAccount(gen)) return
      if (!jwt) {
        set({ jwt: null, walletAddress, isAuthenticated: false, isLoading: false })
        return
      }

      const user = await api.auth.me()
      if (!isSameAccount(gen)) return
      set({ user, jwt, walletAddress, isAuthenticated: true, isLoading: false })
      // Wallets + profile_complete ride a second, non-blocking call, the
      // legacy /v1/auth/me shape feeds the existing screens unchanged.
      void get().refreshMe()
    } catch (e) {
      // Before clearAuthStorage, not just before the `set` — same reason as
      // purgeIfStaleSession above.
      if (!isSameAccount(gen)) return
      if (e instanceof ApiClientError && (e.statusCode === 401 || e.statusCode === 403)) {
        await clearAuthStorage()
        set({
          user: null,
          jwt: null,
          walletAddress: null,
          isAuthenticated: false,
          isLoading: false,
        })
      } else {
        // Transient network error: keep the credentials we already read from
        // SecureStore rather than clearing them, so the next attempt can still
        // use them. `isAuthenticated`/`user` stay unset — `app/index` gates on
        // all three, so this routes to welcome and the user signs in again.
        //
        // refreshMe is deliberately NOT fired here for that reason: a wallets[]
        // load for a session the UI treats as signed out buys nothing, and every
        // sign-in path already fires it (as does each wallet-screen focus).
        set({ jwt, walletAddress, isLoading: false })
      }
    }
  },

  updateUser: (user) => set({ user }),

  refreshUser: async () => {
    const gen = accountGeneration()
    try {
      const user = await api.auth.me()
      if (!isSameAccount(gen)) return
      set({ user })
    } catch {
      // Silently ignore, stale data is better than a crash on focus
    }
  },

  refreshMe: async () => {
    const gen = accountGeneration()
    // Flip to `loading` only when we have nothing to show yet — a background
    // refetch over already-`ready` data must not flash a skeleton.
    set((s) => (s.walletsStatus === 'ready' ? {} : { walletsStatus: 'loading' }))
    try {
      // Bounded retry (transient blips only): the sole populator of wallets[]
      // used to be fire-and-forget and silently swallowed failures, stranding an
      // authenticated user with an empty list and no recovery.
      const me = await withRetry(() => api.users.me(), { shouldRetry: isRetriableMeError })
      // withRetry makes this the longest-lived request here, so the likeliest
      // to outlive its account — and it writes the previous one's wallets[].
      if (!isSameAccount(gen)) return
      set((state) => ({ ...reconcileWalletState(state, me), walletsStatus: 'ready' }))
    } catch {
      if (!isSameAccount(gen)) return
      // Only surface an error when there's nothing loaded; a failed background
      // refresh keeps the last-good list rather than blanking the screen.
      set((s) => (s.walletsStatus === 'ready' ? {} : { walletsStatus: 'error' }))
    }
  },

  retryWalletSync: async () => {
    await get().refreshMe()
  },
}))

/**
 * Selector hook for the current user's seeker status.
 * Used to pick `seeker_fee_bps` vs `fee_bps` and to gate seeker-only UI.
 */
export const useIsSeeker = (): boolean =>
  useAuthStore((s) => s.user?.is_seeker ?? false)
