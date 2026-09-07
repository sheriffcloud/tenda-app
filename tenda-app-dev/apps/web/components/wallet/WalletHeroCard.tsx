/**
 * Wallet balance hero + lifetime stats (web port of mobile's WalletHeroCard
 * and EarningsSummary, one file — they always render together here). The
 * USDC-first total across every linked wallet/chain: gigs settle in USDC on
 * all chains, so it's one summable unit. Display-only.
 *
 * One hairline card (#60 cards pass): the headline in the large mono atom,
 * the lifetime figures on one line beneath it — the #60 preview's wallet
 * card, not three tinted tiles. The brand tint is gone with the shadows:
 * blue is a point on this page, never a fill.
 */
import { formatAmountOrUnknown } from '@tenda/shared'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { formatUsdcFigure } from './money'

/**
 * `null` = this build has no metadata for the balance's asset, so its decimals
 * are unknown and there is no figure to show. Base units are not a rounded
 * version of the amount — they are wrong by 10^decimals — so the hero shows the
 * shared "no value" token instead, the same thing it shows while loading claims
 * nothing.
 */
function Amount({ value }: { value: number | null }) {
  return (
    <span className="type-mono-large text-content-primary">
      {formatAmountOrUnknown(value, formatUsdcFigure)}
    </span>
  )
}

export const WALLET_HERO_COPY = {
  total: 'Total balance',
  unit: 'USDC',
  earned: 'Earned',
  spent: 'Spent',
  lifetime: 'lifetime',
} as const

export function WalletHeroCard({
  totalUsdc,
  earnedUsdc,
  spentUsdc,
  isLoading,
}: {
  totalUsdc: number | null
  earnedUsdc: number | null
  spentUsdc: number | null
  isLoading: boolean
}) {
  return (
    <section className="rounded-card border border-border-subtle bg-surface-card px-[22px] pb-[18px] pt-5">
      <Eyebrow tone="secondary">{WALLET_HERO_COPY.total}</Eyebrow>
      <div className="mt-3 flex min-h-11 items-baseline gap-2.5" aria-busy={isLoading}>
        {isLoading ? (
          <span data-testid="hero-skeleton" className="h-10 w-40 animate-pulse rounded-md bg-surface-inset" />
        ) : (
          <>
            <Amount value={totalUsdc} />
            <span className="font-numeric text-xs leading-4 tracking-[0.5px] text-content-tertiary">
              {WALLET_HERO_COPY.unit}
            </span>
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-[22px] gap-y-1 type-body-small">
        <span>
          <span className="text-content-tertiary">{WALLET_HERO_COPY.earned}</span>{' '}
          <span className="font-numeric font-medium text-numeric-positive">
            + {formatAmountOrUnknown(earnedUsdc, formatUsdcFigure)}
          </span>
        </span>
        <span>
          <span className="text-content-tertiary">{WALLET_HERO_COPY.spent}</span>{' '}
          <span className="font-numeric font-medium text-numeric-negative">
            − {formatAmountOrUnknown(spentUsdc, formatUsdcFigure)}
          </span>
        </span>
        <span className="text-content-tertiary">
          {WALLET_HERO_COPY.unit} · {WALLET_HERO_COPY.lifetime}
        </span>
      </div>
    </section>
  )
}
