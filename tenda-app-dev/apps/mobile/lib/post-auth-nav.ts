import { useNavigationContainerRef } from 'expo-router'

/**
 * Post-login navigation that CLEARS the auth back-stack.
 *
 * The auth flow `push`es forward (welcome → get-started → connect-wallet / …),
 * and `router.replace` only swaps the TOP route, so the pushed auth screens
 * stay in history and Android back returns to them after sign-in. Instead we
 * `reset` the root navigation container to the destination, leaving a single
 * entry so back from home exits the app.
 *
 * Complete profile → the (tabs) group (home). Incomplete → the onboarding
 * profile-setup screen (still inside the (auth) group, so reset into a nested
 * state) which itself routes onward once the name is captured.
 */
export function usePostAuthReset(): (profileComplete: boolean | null) => void {
  const root = useNavigationContainerRef()
  return (profileComplete) => {
    if (!root.isReady()) return
    if (profileComplete) {
      root.reset({ index: 0, routes: [{ name: '(tabs)' }] })
    } else {
      root.reset({
        index: 0,
        routes: [{ name: '(auth)', state: { index: 0, routes: [{ name: 'profile-setup' }] } }],
      })
    }
  }
}

/**
 * Return to the linked-wallets screen after a wallet-link round-trip.
 *
 * Linking from an authenticated session, the wallet's `tenda://` auto-return
 * deep link routes to `/` and `index` redirects an authed user to home,
 * popping `settings/linked-wallets` off the stack. We deterministically rebuild
 * the stack as `[(tabs), settings/linked-wallets]` so the user lands back on
 * the list (its focus effect re-fetches to show the new wallet) with a sane
 * back target, whether or not the wallet auto-returned. Safe to call from the
 * link handler even after that screen unmounted, the container ref is global.
 */
export function useReturnToLinkedWallets(): () => void {
  const root = useNavigationContainerRef()
  return () => {
    if (!root.isReady()) return
    root.reset({ index: 1, routes: [{ name: '(tabs)' }, { name: 'settings/linked-wallets' }] })
  }
}
