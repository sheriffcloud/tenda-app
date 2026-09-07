/**
 * Changing WHICH wallet signs, on this device.
 *
 * `ensure-session.ts` answers "is there a live linked session?"; this answers
 * "make it be THIS wallet instead". The two cases are genuinely different and
 * the copy has to say which one the reader is in:
 *
 *  - FREE signer (create, publish, public accept): any of the reader's linked
 *    wallets on the namespace will do, so the affordance is a Switch.
 *  - BOUND signer (the detail wire's `my_signer_address` — the only source
 *    mobile feeds in today): the chain already fixed the signer, so only that
 *    one can succeed. Every failure path NAMES it — the generic "not linked"
 *    dead end is the bug this replaces. A bound wallet the reader has since
 *    UNLINKED cannot sign under the trust rules, so it is refused with the
 *    re-link instruction rather than a picker that cannot succeed.
 *
 * The adapter is chosen by the USER, not here: mobile's transports are
 * per-wallet-app (WalletConnect for EVM, MWA or Phantom for Solana), so the
 * caller shows the existing WalletPicker and hands the pick in. That is also
 * why there is no `ensureSignerSession` twin of web's: on mobile the switch is
 * always a deliberate act with a picker in front of it.
 */
import {
  BOUND_WALLET_REFUSAL,
  isLinkedWallet,
  sameWalletAddress,
  unlinkedWalletMessage,
  WalletError,
} from '@tenda/shared'
import type { ChainNamespace } from '@tenda/shared'
import { setWalletAddress } from '@/lib/secure-store'
import { useAuthStore } from '@/stores/auth.store'
import type { WalletAdapter } from '@/wallet/adapters/types'

/**
 * The slice of an adapter this needs: a teardown and a fresh connect. Narrower
 * than `WalletAdapter` on purpose — a full adapter satisfies it, and a test
 * double no longer has to be cast through `unknown` to stand in for ten
 * members it never touches.
 */
export type SignerTransport = Pick<WalletAdapter, 'connect' | 'disconnect'>

/**
 * Publish the connected account to the namespace's signer slot.
 *
 * PERSIST FIRST, then set — the order `signInWithWallet` uses. Setting first
 * and persisting second means a secure-store failure reports an error the user
 * can act on while the switch has ALREADY taken effect, which is a worse lie
 * than the failure itself.
 */
async function publishSession(ns: ChainNamespace, address: string): Promise<void> {
  if (ns === 'eip155') {
    // Session-scoped by design (auth.types): nothing to persist.
    useAuthStore.setState({ evmAddress: address })
    return
  }
  // Solana's slot IS persisted — it is read as a pubkey by the balance and
  // quote surfaces and has to survive a restart, exactly as a sign-in does.
  await setWalletAddress(address)
  useAuthStore.setState({ walletAddress: address })
}

/**
 * Connect `adapter` afresh and adopt the account it returns as this device's
 * signer on `ns`. `required` makes it the BOUND case: the pick has to be that
 * exact wallet.
 *
 * `fresh: true` is load-bearing — without it a transport with a live session
 * short-circuits back to the very wallet the reader is trying to move off.
 * Returns the adopted address; throws WalletError('declined') when the reader
 * closes the wallet, which callers treat as a change of mind, not a failure.
 */
export async function switchSignerWith(
  adapter: SignerTransport,
  ns: ChainNamespace,
  required?: string | null,
): Promise<string> {
  const { wallets } = useAuthStore.getState()
  if (required != null && !isLinkedWallet(ns, required, wallets)) {
    throw new WalletError('no_wallet', BOUND_WALLET_REFUSAL.unlinked(required))
  }

  await adapter.disconnect()
  const account = await adapter.connect({ fresh: true })

  // Re-read: the disconnect/connect round-trip is long enough for a refreshMe
  // to have landed, and the trust check must run against the current list.
  const current = useAuthStore.getState().wallets
  if (!isLinkedWallet(ns, account.address, current)) {
    throw new WalletError('no_wallet', unlinkedWalletMessage(ns, current))
  }
  if (required != null && !sameWalletAddress(ns, account.address, required)) {
    throw new WalletError('no_wallet', BOUND_WALLET_REFUSAL.wrongWallet(required))
  }

  await publishSession(ns, account.address)
  return account.address
}
