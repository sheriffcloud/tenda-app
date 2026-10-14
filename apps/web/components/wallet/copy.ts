/**
 * The wallet surface's strings.
 *
 * The comp's action row is Buy USDC / Sell USDC / P2P offers. There is no Buy:
 * onramp was retired in #61 (spec-correction #1), so the row carries the two
 * things a holder can actually do — sell at the market rate, or take their own
 * offer to the book.
 */
export const WALLET_COPY = {
  title: 'Wallet',
  /**
   * The gas grant, as WEB says it (#53c-2). The claim is app-only — the server
   * refuses a session stamped `web` — so this names the grant and points at the
   * app rather than offering a control that would be refused.
   *
   * Kept beside the rest of this screen's copy, not inside the notice
   * component, because it has to stay in step with the app's own wording and
   * the landing page's: three surfaces describing one grant.
   */
  gasClaimTitle: 'Gas on us',
  gasClaimInApp:
    'A one-time gas grant is waiting on your account. Claim it in the Tenda app — it is paid to the wallet you sign with.',
  refresh: 'Refresh',
  refreshing: 'Refreshing…',
  /**
   * NOT "Sell USDC", which the comp says. `exchangeAssetsByChain` makes SOL
   * and ETH sellable too, so naming a ticker here is wrong for anyone holding
   * the other one — the same correction #18 applied to the exchange title
   * (spec-correction #37). It also matches the destination page's own name.
   */
  sell: 'Sell crypto',
  offers: 'P2P offers',
  activity: 'Activity',
  /** The comp's count line, which says what the number counts. */
  count: (total: number) => `${total} ${total === 1 ? 'transaction' : 'transactions'}`,
  emptyTitle: 'No activity yet',
  emptyBody: 'Gig settlements, trades and payouts all land in this feed.',
  loadMore: 'Load more',
  loadingMore: 'Loading…',
  noWalletTitle: 'No wallet linked yet',
  noWalletBody: 'Link one to see balances and to receive payments. Tenda never holds your keys.',
  noWalletAction: 'Link a wallet',
  walletsErrorTitle: 'Your linked wallets could not be loaded',
  walletsErrorBody:
    'This is a read failure, not a change to your wallets. Nothing on-chain is affected.',
  balancesErrorTitle: 'Balances are unavailable',
  balancesErrorBody:
    'The chain registry could not be loaded, so a balance here would be a guess rather than a reading.',
  retry: 'Try again',
  /** Per-balance note when a chain has no native token reading. */
  noNative: 'Native balance unavailable',
} as const
