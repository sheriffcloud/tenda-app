'use client'

/**
 * The wallet card (#60): the USDC headline across every linked wallet and
 * chain, lifetime earned/spent, then one row per chain with the chain badge,
 * the short address (and the primary mark) and the two balances — all off
 * `useWalletScreen`, the same controller the Wallet surface runs, so the
 * card and the page cannot disagree about a figure. Balances are read from
 * the chain in the BROWSER (the server never reads a wallet; the product is
 * non-custodial), so a reader with no linked wallet is invited to link one
 * rather than shown a confident zero.
 *
 * `LinkedWallet` carries chain_ns · address · is_primary and no provider
 * name, so the caption is the address and the primary mark, never "Phantom".
 */
import Link from 'next/link'
import {
  amountRawToDisplay,
  formatAmountOrUnknown,
  truncateWallet,
  type AssetBalance,
  type WalletChainBalance,
} from '@tenda/shared'
import { ChainBadge } from '@/components/shared/ChainBadge'
import { buttonVariants } from '@/components/ui/Button'
import { formatUsdcFigure } from '@/components/wallet/money'
import { useWalletScreen } from '@/hooks/wallet/useWalletScreen'
import { useAuthStore } from '@/stores/auth.store'
import { HOME_COPY } from './copy'
import { DashCard, DashPill } from './primitives'

export const WALLET_HREF = '/wallet'
export const LINK_WALLET_HREF = '/settings/linked-wallets'

function balanceText(balance: AssetBalance | null): string | null {
  if (balance === null) return null
  return `${formatAmountOrUnknown(amountRawToDisplay(balance.amountRaw, balance.assetId), formatUsdcFigure)} ${balance.symbol}`
}

function ChainRow({ balance, primary }: { balance: WalletChainBalance; primary: boolean }) {
  const usdc = balanceText(balance.usdc)
  const native = balanceText(balance.native)
  const quiet = balance.usdc === null || balance.usdc.amountRaw === '0'
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border-subtle py-[11px] last:border-b-0">
      <span className="flex min-w-0 items-center gap-2.5">
        <ChainBadge chainId={balance.chainId} glyphOnly />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold leading-5 text-content-primary">{balance.displayName}</span>
          <span className="font-numeric type-caption text-content-tertiary">
            {truncateWallet(balance.address)}
            {primary && ` · ${HOME_COPY.wallet.primary}`}
          </span>
        </span>
      </span>
      <span className="flex flex-col items-end gap-0.5 text-right">
        {usdc !== null && (
          <span className={`font-numeric text-xs leading-4 ${quiet ? 'text-content-tertiary' : 'text-content-primary'}`}>
            {usdc}
          </span>
        )}
        {native !== null && <span className="font-numeric type-caption text-content-tertiary">{native}</span>}
      </span>
    </li>
  )
}

function HeadlineSkeleton() {
  return <span data-testid="wallet-card-skeleton" className="h-9 w-36 animate-shimmer rounded-xs bg-surface-inset" />
}

export function WalletCard() {
  const wallets = useAuthStore((s) => s.wallets)
  const { section, balances, totalUsdc, earnedUsdc, spentUsdc, isLoading, retryWallets } = useWalletScreen()
  const primaryAddresses = new Set(wallets.filter((w) => w.is_primary).map((w) => w.address))
  const linked = wallets.length
  // The list is KNOWN once it holds a wallet (a last-good list counts) or has
  // settled empty. While it is still loading, or failed with nothing held, the
  // count and the invitation would both be claims about a registry nobody has
  // read — "0 wallets linked · link one" to a reader with two, for as long as
  // /v1/users/me takes on every mount. The shared resolver's own rule:
  // idle/loading is never advertised as "no wallet linked".
  const walletsKnown = linked > 0 || section === 'no-wallet'
  const hasWallet = walletsKnown && linked > 0
  // A balance row is one (wallet, chain) pair — two wallets on one chain are
  // two rows — and the caption promises CHAINS. Omitted while no row has
  // resolved: "across 0 chains" beside "2 wallets linked" is a claim the
  // registry has not answered yet.
  const chainCount = new Set(balances.map((balance) => balance.chainId)).size

  return (
    <DashCard
      title={HOME_COPY.wallet.title}
      pill={
        walletsKnown ? (
          <DashPill dot={linked > 0 ? 'live' : 'quiet'}>{HOME_COPY.wallet.linked(linked)}</DashPill>
        ) : undefined
      }
      more={{ href: WALLET_HREF, label: HOME_COPY.wallet.open }}
    >
      {!walletsKnown && section === 'wallets-error' && (
        <p className="mt-4 flex flex-wrap items-center gap-3 type-body-small text-content-tertiary">
          <span>{HOME_COPY.wallet.walletsError}</span>
          <button type="button" onClick={() => void retryWallets()} className="font-semibold text-content-link">
            {HOME_COPY.wallet.retry}
          </button>
        </p>
      )}
      {!walletsKnown && section !== 'wallets-error' && (
        <p className="mt-4" aria-busy>
          <HeadlineSkeleton />
        </p>
      )}
      {hasWallet && (
        <>
          <p className="mt-4 flex flex-wrap items-baseline gap-2.5" aria-busy={isLoading}>
            {isLoading ? (
              <HeadlineSkeleton />
            ) : (
              <span className="type-mono-large text-content-primary">{formatAmountOrUnknown(totalUsdc, formatUsdcFigure)}</span>
            )}
            {chainCount > 0 && (
              <span className="font-numeric text-xs leading-4 tracking-[0.5px] text-content-tertiary">
                {HOME_COPY.wallet.across(chainCount)}
              </span>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-[22px] gap-y-1 type-body-small">
            <span>
              <span className="text-content-tertiary">{HOME_COPY.wallet.earned}</span>{' '}
              <span className="font-numeric font-medium text-utility-money">+{formatAmountOrUnknown(earnedUsdc, formatUsdcFigure)}</span>
            </span>
            <span>
              <span className="text-content-tertiary">{HOME_COPY.wallet.spent}</span>{' '}
              <span className="font-numeric font-medium text-content-primary">−{formatAmountOrUnknown(spentUsdc, formatUsdcFigure)}</span>
            </span>
          </div>
          {section === 'balances-unavailable' && (
            <p className="mt-3 type-body-small text-content-tertiary">{HOME_COPY.wallet.unavailable}</p>
          )}
          {balances.length > 0 && (
            <ul className="mt-4 border-t border-border-default">
              {balances.map((balance) => (
                <ChainRow
                  key={`${balance.chainId}:${balance.address}`}
                  balance={balance}
                  primary={primaryAddresses.has(balance.address)}
                />
              ))}
            </ul>
          )}
        </>
      )}
      {walletsKnown && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-dashed border-border-strong px-3.5 py-3">
          <span className="min-w-0 flex-1 type-body-small text-content-secondary">
            {hasWallet ? HOME_COPY.wallet.linkHint : HOME_COPY.wallet.linkFirst}
          </span>
          <Link href={LINK_WALLET_HREF} className={buttonVariants({ variant: 'outline', size: 'md' })}>
            {HOME_COPY.wallet.link}
          </Link>
        </div>
      )}
    </DashCard>
  )
}
