import { create } from 'zustand'
import {
  ApiClientError,
  hasCompleteName,
  withRetry,
  type IdentityMethodWire,
  type LinkedWallet,
  type LoadStatus,
  type User,
  type VerifyBody,
} from '@tenda/shared'
import { SIGNED_OUT, isRetriableMeError, purgeIfStaleSession } from './auth/session-helpers'
import { api } from '@/api/client'
import { clearAuthStorage, getJwtToken, setJwtToken } from '@/lib/storage'
import { signInWithWallet as walletSignIn, linkWalletWith } from '@/wallet/auth'
import {
  accountGeneration,
  beginAccountSession,
  clearAccountState,
  isSameAccount,
} from '@/lib/account-state'
import type { WalletAdapter } from '@/wallet/adapters/types'

/**
 * Web port of apps/mobile/stores/auth.store.ts — same semantics (stale-bearer
 * purge, 401/403-clears vs transient-keeps bootstrap, the server's own
 * profile-complete predicate). Stage 3 adds the wallet half: sign-in/link via
 * the adapter seam and the LINKED wallets list (wallet-reliability doctrine:
 * linked(wallets[]) ≠ connected — the live connection belongs to AppKit, this
 * store only mirrors the server's registry).
 */
export interface AuthState {
  user: User | null
  jwt: string | null
  isAuthenticated: boolean
  /** True until the first loadSession resolves — gates render vs redirect. */
  isLoading: boolean
  /** null until known; false routes to /onboarding/profile. */
  profileComplete: boolean | null
  identities: IdentityMethodWire[]
  /** The methods read's lifecycle — `identities` is empty for EVERY account
   *  until it answers, so a surface needs this to tell "none" from "not yet". */
  identitiesStatus: LoadStatus
  /** Server-verified linked wallets (never the live connection). */
  wallets: LinkedWallet[]
  walletsStatus: 'idle' | 'loading' | 'ready' | 'error'

  signInWithVerify: (body: VerifyBody) => Promise<{ isNew: boolean }>
  /** True = signed in; false = user declined in the wallet. WALLET_NOT_LINKED throws. */
  signInWithWallet: (adapter: WalletAdapter) => Promise<boolean>
  /** True = linked; false = user declined. Collision/errors throw. */
  linkWallet: (adapter: WalletAdapter) => Promise<boolean>
  refreshWallets: () => Promise<void>
  /** Load the linked wallets once, for surfaces that read but do not own them. */
  ensureWallets: () => Promise<void>
  linkIdentity: (body: VerifyBody) => Promise<void>
  loadMethods: () => Promise<void>
  logout: () => Promise<void>
  loadSession: () => Promise<void>
  refreshUser: () => Promise<void>
  updateUser: (user: User) => void
  setProfileComplete: (complete: boolean) => void
}

/** The signed-out write a stale-bearer purge makes (session-helpers). */
const markSignedOut = () => useAuthStore.setState({ jwt: null, isAuthenticated: false })

export { SIGNED_OUT } from './auth/session-helpers'

// The wallets[] load currently on the wire, so `ensureWallets` can JOIN it
// rather than observe `loading` and return with nothing ensured (chain
// registry's `inflight` pattern; stale ones resolve harmlessly — the
// generation guard inside already dropped their writes).
let walletsInflight: Promise<void> | null = null

export const useAuthStore = create<AuthState>((set, get) => ({
  ...SIGNED_OUT,
  isLoading: true,

  signInWithVerify: async (body) => {
    const res = await api.auth.verify(body).catch(async (e: unknown) => {
      await purgeIfStaleSession(e, markSignedOut)
      throw e
    })
    await setJwtToken(res.token)
    // Signing IN is an account change too. `logout` cleared, but the
    // signed-out window is not inert — the conversation poll runs while the
    // socket is down — so a request issued in it would otherwise land in this
    // brand-new session. BUMP only, never clear: the sign-in flow store is
    // mid-use right here (lib/account-state, #45).
    beginAccountSession()
    set({
      user: res.user,
      jwt: res.token,
      isAuthenticated: true,
      isLoading: false,
      // Same profile-complete predicate the server uses — cannot drift.
      profileComplete: hasCompleteName(res.user.first_name, res.user.last_name),
    })
    // Settle wallets[] in the background (mobile parity): every tx path and
    // chain-eligibility read depends on it; navigation does not.
    void get().refreshWallets()
    return { isNew: res.is_new }
  },

  signInWithWallet: async (adapter) => {
    const result = await walletSignIn(adapter).catch(async (e: unknown) => {
      await purgeIfStaleSession(e, markSignedOut)
      throw e
    })
    if (result === null) return false // declined in the wallet

    const { auth } = result
    await setJwtToken(auth.token)
    // Same reason as the verify path above.
    beginAccountSession()
    set({
      user: auth.user,
      jwt: auth.token,
      isAuthenticated: true,
      isLoading: false,
      profileComplete: hasCompleteName(auth.user.first_name, auth.user.last_name),
    })
    void get().refreshWallets()
    return true
  },

  linkWallet: async (adapter) => {
    const account = await linkWalletWith(adapter)
    if (account === null) return false
    // Reflect the freshly-linked wallet in the cached wallets[] list.
    await get().refreshWallets()
    return true
  },

  /**
   * Load the linked-wallet list ONCE, for surfaces that need it but do not
   * own it (chain registry's `ensureLoaded` doctrine). A load already in
   * flight is JOINED, never skipped — the session bootstrap fires one on
   * every sign-in/restore, and a tx guard that "ensured" without waiting for
   * it would hard-fail the user's first click of the session. Added because
   * the sell surface asked which assets it could sell before anything had
   * loaded the wallets, and told a reader with a linked wallet to link one.
   */
  ensureWallets: async () => {
    if (get().walletsStatus === 'ready') return
    if (walletsInflight !== null) return walletsInflight
    await get().refreshWallets()
  },

  refreshWallets: async () => {
    // #45 applies HERE too — owning the transition is not a guard. The worst
    // of this store's four: useWalletScreen decides its section from `wallets`
    // AND passes them to readWalletBalances, so a late response shows the next
    // reader the previous account's addresses and their real balances.
    const gen = accountGeneration()
    set({ walletsStatus: 'loading' })
    const run = (async () => {
      try {
        // Bounded retry (transient blips only, mobile parity): the sole
        // populator failing silently strands the trust registry empty.
        const res = await withRetry(() => api.users.me(), { shouldRetry: isRetriableMeError })
        if (!isSameAccount(gen)) return
        set({ wallets: res.wallets, walletsStatus: 'ready' })
      } catch {
        // Keep the last-good list (never blank a rendered list to an error);
        // the status tells the screen to offer a retry. Not for a dead session,
        // though: 'idle' is what the sign-out left, and an 'error' there would
        // offer the next reader a retry for a request that was never theirs.
        if (!isSameAccount(gen)) return
        set({ walletsStatus: 'error' })
      }
    })()
    walletsInflight = run
    try {
      await run
    } finally {
      if (walletsInflight === run) walletsInflight = null
    }
  },

  linkIdentity: async (body) => {
    // link: true attaches the bearer → server LINKS instead of logging in.
    // The returned token is discarded: the current session stays untouched.
    await api.auth.verify(body, { link: true })
    await get().loadMethods()
    void get().refreshUser()
  },

  loadMethods: async () => {
    // Identities are the account's own sign-in methods, so a late response
    // lists the previous account's on the next one's security screen (#45).
    const gen = accountGeneration()
    set({ identitiesStatus: 'loading' })
    try {
      const res = await api.auth.methods()
      if (!isSameAccount(gen)) return
      set({ identities: res.identities, identitiesStatus: 'ready' })
    } catch {
      // Non-fatal: the last list stays; the status says the read failed.
      if (!isSameAccount(gen)) return
      set({ identitiesStatus: 'error' })
    }
  },

  logout: async () => {
    // Sign-out is a soft navigation, so every store and module-scoped cache in
    // this tab outlives the session unless it is emptied here. Each of them
    // declares itself account-scoped where it is defined; this empties the lot
    // (lib/account-state.ts).
    clearAccountState()
    // AFTER the bump, not before: clearAccountState() moves the generation, so
    // a snapshot taken above could never match. What this guards is the tail of
    // this very function — the awaits below include a WalletConnect relay
    // round-trip, and a sign-in completed across them bumps again, at which
    // point this SIGNED_OUT write would blank the session the reader just
    // opened (#45 re-audit; reproduced with a deferred disconnect).
    const gen = accountGeneration()
    await clearAuthStorage()
    // Best-effort: drop the wallet session too, so the next sign-in shows the
    // picker instead of silently reusing a stale session across accounts
    // (mobile doctrine). peek-only — never boots the wallet stack to log out.
    // Keep the heavy Reown graph out of every surface that merely reads the
    // auth store. Logout is the only store action that needs this adapter.
    try {
      const { reownAdapter } = await import('@/wallet/adapters/reown')
      await reownAdapter.disconnect()
    } catch {
      // Loading the optional wallet chunk and disconnecting it are both
      // best-effort. Neither may leave the already-cleared auth session live.
    }
    if (!isSameAccount(gen)) return
    set({ ...SIGNED_OUT, isLoading: false })
  },

  loadSession: async () => {
    // The bootstrap ASSERTS a session, so it writes an account rather than
    // merely reading one: landing after a sign-out it signs the tab back in as
    // the account whose credential was just cleared (#45). Dropping the write
    // cannot strand `isLoading` — every path that moves the generation settles
    // that flag itself (logout, sign-in, and the cross-tab branches, the
    // sign-IN one by re-running this under the new generation).
    const gen = accountGeneration()
    let jwt: string | null = null
    try {
      jwt = await getJwtToken()
      if (!isSameAccount(gen)) return
      if (jwt === null || jwt === '') {
        set({ ...SIGNED_OUT, isLoading: false })
        return
      }
      const user = await api.auth.me()
      if (!isSameAccount(gen)) return
      set({
        user,
        jwt,
        isAuthenticated: true,
        isLoading: false,
        profileComplete: hasCompleteName(user.first_name, user.last_name),
      })
      // Wallets ride a second, non-blocking call (mobile's loadSession →
      // refreshMe): a restored session lands with its trust registry loading.
      void get().refreshWallets()
    } catch (e) {
      if (!isSameAccount(gen)) return
      if (e instanceof ApiClientError && (e.statusCode === 401 || e.statusCode === 403)) {
        await clearAuthStorage()
        // Re-checked: clearing storage is itself an await.
        if (!isSameAccount(gen)) return
        set({ ...SIGNED_OUT, isLoading: false })
      } else {
        // Transient failure: keep the stored credential for the next attempt
        // but treat the session as signed out for routing (mobile behavior).
        set({ jwt, isLoading: false })
      }
    }
  },

  refreshUser: async () => {
    // A focus refresh that resolves after a sign-out would put the previous
    // account's name and profile state back on screen (#45).
    const gen = accountGeneration()
    try {
      const user = await api.auth.me()
      if (!isSameAccount(gen)) return
      set({
        user,
        profileComplete: hasCompleteName(user.first_name, user.last_name),
      })
    } catch {
      // Stale data beats a crash on focus.
    }
  },

  updateUser: (user) => set({ user }),
  setProfileComplete: (complete) => set({ profileComplete: complete }),
}))
