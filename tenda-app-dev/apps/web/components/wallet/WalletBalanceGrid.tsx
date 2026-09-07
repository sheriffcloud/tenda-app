/**
 * The balances grid (Tier-3 comp, lines 650-660): one card per chain the
 * reader holds on, the figure at deciding size with its ticker beside it.
 *
 * A chain with NO reading shows an em-dash and says so in its note. It does
 * not show `0.00`: "you have nothing here" and "we could not read this" are
 * different facts, and the second one dressed as the first is the wallet bug
 * this app already fixed once at the section level (`resolveWalletSection`).
 */
import {
  splitAssetAmount,
  truncateWallet,
  type AssetBalance,
  type WalletChainBalance,
} from '@tenda/shared'
import { WALLET_COPY } from './copy'

interface Reading {
  value: string
  unit: string
}

/**
 * Through the shared formatter, like every other amount in the app and like
 * this grid's own mobile twin (WalletBalanceRows → formatAssetAmount).
 *
 * It used to ask `toLocaleString` for `balance.decimals` fraction digits off a
 * float, which for the 18-decimal assets (ETH, cUSD, CELO) is more precision
 * than a double carries: 1.234567890123456789 cUSD rendered as
 * "1.2345678901234567" — six trailing digits of float noise presented as a
 * balance (#50). The mobile twin never had it: WalletBalanceRows formats both
 * figures with `formatAssetAmount`, which is `splitAssetAmount` joined.
 *
 * `balance.symbol` stays the unit rather than the formatter's, and the two
 * cannot disagree: `assertManifestValid` refuses at import any chain asset id
 * missing from ASSET_META, and the registry these readings carry is seeded
 * from that manifest. So this is the chain read's own ticker, not a fallback
 * for an asset the metadata lacks — the VALUE has no such second source, and
 * would be unscaled base units if one ever existed.
 */
function readingOf(balance: AssetBalance | null): Reading | null {
  if (balance === null) return null
  return {
    value: splitAssetAmount(balance.amountRaw, balance.assetId).amount,
    unit: balance.symbol,
  }
}

export function WalletBalanceGrid({ balances }: { balances: WalletChainBalance[] }) {
  if (balances.length === 0) return null

  return (
    <div
      data-bal
      className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5"
    >
      {balances.map((balance) => {
        const usdc = readingOf(balance.usdc)
        const native = readingOf(balance.native)
        return (
          <div
            key={`${balance.chainId}:${balance.address}`}
            className="rounded-card border border-border-subtle bg-surface-card p-5 shadow-card"
          >
            <p className="truncate type-body-small font-semibold text-content-secondary">
              {balance.displayName}
            </p>
            <p className="mt-2 flex items-baseline gap-1.5">
              <span className="font-numeric text-[28px] font-bold leading-8 tracking-[-0.6px] text-content-primary">
                {usdc?.value ?? '—'}
              </span>
              <span className="font-numeric type-body-small text-content-tertiary">
                {usdc?.unit ?? ''}
              </span>
            </p>
            <p className="mt-2 truncate font-numeric text-xs leading-4 text-content-tertiary">
              {truncateWallet(balance.address)}
              {native !== null ? ` · ${native.value} ${native.unit}` : ` · ${WALLET_COPY.noNative}`}
            </p>
          </div>
        )
      })}
    </div>
  )
}
