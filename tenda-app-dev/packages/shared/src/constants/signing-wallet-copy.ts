/**
 * The signer-preview sentence — "Signing with 0x12…abcd on Base Sepolia" and
 * its affordance — plus the label an escrow's BOUND wallet is named by.
 *
 * Shared because both clients say it and both must say it the SAME way: this
 * is the one place a user is told which wallet is about to open, and a
 * difference in wording between the app and the web is a difference in what
 * they think is being signed. It is assembled from pieces rather than one
 * string because the address is rendered in its own style mid-sentence.
 */
import { truncateWallet } from '../utils/wallet'
import { verifiedWalletsOn } from '../wallet/wallet-address'
import type { ChainNamespace } from '../db/schema/chains'
import type { LinkedWallet } from '../api/contracts/auth.contract'

/** Label over the viewer-relative bound wallet (`my_signer_address`). */
export const BOUND_WALLET_LABEL = 'Your escrow wallet'

export const SIGNING_WALLET_COPY = {
  /** Leads the preview: "Signing with " + <address>. */
  prefix: 'Signing with',
  /** Closes it: <address> + " on Base Sepolia". */
  chainSuffix: (chain: string) => `on ${chain}`,
  /** Stands in for the address when the reader has nothing linked. */
  noWallet: 'no linked wallet',
  /** Free signer: any linked wallet on the namespace will do. */
  switchAction: 'Switch',
  /**
   * BOUND signer: the chain fixed the wallet, so the affordance can only
   * succeed as that exact one — "Connect", not "Switch", because there is no
   * choice left to make.
   */
  connectAction: 'Connect',
  /** While the wallet app is open and the answer has not come back. */
  waiting: 'Waiting…',
  /** The switch failed for a reason the wallet did not name. */
  switchFailed: 'Could not switch wallets',
  /**
   * The previewed wallet positively holds less than this action debits —
   * said while the user can still switch or top up, instead of after the
   * revert.
   */
  shortFunds: (held: string, needed: string) =>
    `This wallet holds ${held} but ${needed} is needed — switch wallet or add funds first.`,
} as const

/**
 * The refusal when the connected wallet is a STRANGER to this account. It
 * names the wallets that would have worked, because "not linked" on its own
 * leaves the reader with nothing to do — they are usually one wallet-app
 * account away from the right one.
 */
export function unlinkedWalletMessage(ns: ChainNamespace, wallets: LinkedWallet[]): string {
  const linked = verifiedWalletsOn(ns, wallets).map((w) => truncateWallet(w.address))
  return linked.length > 0
    ? `Connect one of your linked wallets (${linked.join(', ')}) to sign this transaction`
    : 'Connect one of your linked wallets to sign this transaction'
}

/**
 * The two BOUND-signer refusals. Both name the exact wallet: on a bound
 * transition there is only one that can succeed, so any message that does not
 * say which one is a dead end.
 */
export const BOUND_WALLET_REFUSAL = {
  /** The bound wallet is no longer linked — a picker could not fix this. */
  unlinked: (required: string) =>
    `This escrow is signed by ${truncateWallet(required)}, which is no longer linked to your account, re-link it in Settings to continue`,
  /** The reader connected (or dismissed) something else. */
  wrongWallet: (required: string) =>
    `Connect ${truncateWallet(required)}, the wallet this escrow is signed by to continue`,
} as const
