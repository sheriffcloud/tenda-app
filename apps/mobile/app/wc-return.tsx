/**
 * WalletConnect return trampoline. Wallets deep-link back to
 * `tenda://wc-return` (WC_RETURN_URL, wallet/config) after approve/sign;
 * expo-router pushes this route on top of whatever the user was doing, and it
 * immediately pops itself — so a wallet round-trip returns to the EXACT
 * screen that launched it (gig detail, linked-wallets, sign-in) instead of
 * resetting the stack, which is what a bare `tenda://` redirect did and why
 * TrustWallet connects looked like the app "closed and reopened".
 *
 * Cold start (the process died while the wallet was foregrounded): the link
 * is the launch URL, there is nothing to pop, so fall through to `/` — index
 * owns the auth-state routing and the `walletAuthInProgress` spinner.
 */
import { useEffect } from 'react'
import { useRouter } from 'expo-router'

export default function WcReturn() {
  const router = useRouter()
  useEffect(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }, [router])
  // Intentionally paints nothing: it exists for a single frame before popping,
  // and the root Stack renders it without animation (see app/_layout).
  return null
}
