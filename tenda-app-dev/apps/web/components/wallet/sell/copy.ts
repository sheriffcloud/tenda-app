/**
 * The sell surface's strings and its URL helper.
 *
 * The route path stays `/wallet/buy-sell` even though there is no Buy: it is
 * mobile's path and existing links (and the wallet's own action row) point at
 * it. Renaming it would break them for a word nobody sees.
 */
import { DEFAULT_SELL_MODE, type SellMode } from './tabs'

export { SELL_MODES, sellMode, DEFAULT_SELL_MODE, type SellMode } from './tabs'

/** The sell route carrying the mode when it is not the default. */
export function sellHref(mode: SellMode): string {
  return mode === DEFAULT_SELL_MODE ? '/wallet/buy-sell' : `/wallet/buy-sell?mode=${mode}`
}

export const SELL_COPY = {
  eyebrow: 'Wallet',
  title: 'Sell crypto',
  back: 'Wallet',
  modeGroupLabel: 'How to sell',
  /** Named per mode, because the two do genuinely different things. */
  lede: (mode: SellMode) =>
    mode === 'instant'
      ? 'Cash out at the live market rate. The quote is fixed when you confirm.'
      : 'Post your own rate as a P2P offer and wait for a buyer to take it.',
  /** The picker's heading — mobile's SellAssetAmount label, verbatim. */
  assetLabel: 'You sell',
  amountLabel: 'Amount to sell',
  noWallet: 'Link a wallet to cash out crypto.',
  noWalletAction: 'Link a wallet',
  noPayout: 'Add a payout account so we know where the money goes.',
  /** The list state's disclosure toggle for the same inline form. */
  addAccount: 'Add another account',
  closeAddAccount: 'Close account form',
  addFormNote: 'Create and select a payout destination without losing what you typed.',
  confirm: 'Confirm cash-out',
  /**
   * The comp's note promises a rate "fixed when you confirm", which is true of
   * the instant quote and NOT of an offer — an offer's rate is fixed when you
   * post it, and it sits there until someone takes it.
   */
  ctaNote: (mode: SellMode) =>
    mode === 'instant'
      ? 'The quote above is what settles. It expires, and an expired quote is re-fetched rather than sent.'
      : 'Your offer goes on the order book at the rate you set. Nothing moves until a buyer accepts.',
  quote: {
    rate: 'Rate',
    fee: 'Fee',
    receive: 'You receive',
    expires: 'Quote expires in',
    refresh: 'Refresh quote',
    loading: 'Fetching a price…',
    expired: 'This quote has expired',
    expiredBody: 'Prices move. Refresh to get one you can act on.',
  },
  unavailableTitle: 'No cash-out route right now',
  unavailableBody:
    'No provider can fill this amount at the moment. Your balance is untouched — try a different amount, or come back shortly.',
  /** The rails said no — so the way forward is the OTHER way to sell. */
  unavailableAction: 'Post it as an offer instead',
  failedTitle: 'The price could not be fetched',
  failedBody: 'Nothing has been submitted. This is a read failure, and retrying is safe.',
  retry: 'Try again',
  railLabel: 'Where the money lands',
  railNote:
    'Rates are quoted per whole asset unit. Transfers submitted after a rail’s cut-off land the next working day.',
} as const
