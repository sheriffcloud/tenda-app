/**
 * Connect-on-demand guard for EVM signing. A linked wallet (`wallets[]`) proves
 * OWNERSHIP; signing needs a LIVE WalletConnect session on this device. The two
 * are independent — after an app restart, a session drop, or signing in on a
 * different device, the wallet is still linked but no provider is live. The old
 * behaviour dead-ended the transaction with "No EVM wallet connected"; this
 * instead opens the connect flow so the user reconnects a linked wallet, then
 * keeps `evmAddress` in step with whatever wallet is actually connected — so the
 * subsequent `resolveEvmFrom()` signs FROM the live session, never a stale slot.
 *
 * Non-custodial and in-model: the CONNECTED wallet is the signer; we only
 * require it to be one the user has linked (a stranger wallet can't sign this
 * account's escrows). We never force a specific server-chosen address.
 */

import { connectionSignal } from '@/wallet/reown/connection-signal'
import { isLinkedWallet } from '@/wallet/wallet-address'
import { WalletError } from '@/wallet/errors'
import { useAuthStore } from '@/stores/auth.store'

export async function ensureEvmSession(): Promise<void> {
  // 1. Guarantee a live provider. When absent, open the connect flow rather
  //    than failing the transaction outright. `connect()` throws
  //    WalletError('declined') if the user cancels — which aborts the flow.
  let account = connectionSignal.getAccount()
  if (connectionSignal.getProvider() === undefined) {
    account = await connectionSignal.connect()
  }
  if (connectionSignal.getProvider() === undefined || account === null) {
    throw new WalletError('no_wallet', 'No EVM wallet connected, connect one first')
  }

  // 2. The connected wallet must be one the user has linked (verified). A
  //    non-linked wallet can't act on this account's escrows.
  const { wallets } = useAuthStore.getState()
  if (!isLinkedWallet('eip155', account.address, wallets)) {
    throw new WalletError('no_wallet', 'Connect one of your linked wallets to sign this transaction')
  }

  // 3. Sync the signer slot to the live session so resolveEvmFrom() (called
  //    right after) resolves the wallet actually connected now.
  useAuthStore.setState({ evmAddress: account.address })
}
