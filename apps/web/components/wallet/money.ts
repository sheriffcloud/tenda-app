/**
 * The USDC headline figure as the wallet surfaces print it — two decimals,
 * thousands grouped — shared by the Wallet page's hero and the dashboard's
 * wallet card (#60) so the two cannot round or group differently. Display
 * only: it takes the number `amountRawToDisplay` already produced, never a
 * base-unit string.
 */
export function formatUsdcFigure(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
