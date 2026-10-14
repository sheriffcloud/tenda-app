'use client'

/**
 * The order book's control row (Tier-3 comp, lines 400-413): the two lists,
 * the currency chips, and the count of what is on screen.
 *
 * The comp's first chip group toggles market sides; ours picks between the
 * market and the reader's own trades (#32). Those two are places, so they are
 * LINKS — each has an address, and a reader can open one in a new tab. The
 * filters are not places in the same sense: they narrow the list in front of
 * you, so they stay the comp's `aria-pressed` buttons and write the URL with
 * `replace` — ten chips tried should not be ten Back presses to leave.
 *
 * The chain row is ours, not the comp's. It filters both lists, so it sits
 * with the currency chips rather than inside either one.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PAYOUT_CURRENCIES } from '@tenda/shared'
import { Chip } from '@/components/ui/Chip'
import { ChainFilterChips } from '@/components/shared/ChainFilterChips'
import { cn } from '@/lib/cn'
import {
  EXCHANGE_COPY,
  EXCHANGE_TABS,
  currencyChipLabel,
  exchangeHref,
  type ExchangeRouteState,
} from './copy'

export function ExchangeFilters({
  route,
  countLabel,
}: {
  route: ExchangeRouteState
  /** Monospace count of what the active list holds; omitted until it answers. */
  countLabel?: string
}) {
  const router = useRouter()

  return (
    <div className="flex flex-wrap items-center gap-5 border-b border-border-default pb-5">
      <div className="flex gap-1.5" role="group" aria-label={EXCHANGE_COPY.tabGroupLabel}>
        {EXCHANGE_TABS.map((tab) => {
          const current = tab.key === route.tab
          return (
            <Link
              key={tab.key}
              href={exchangeHref({ ...route, tab: tab.key })}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'rounded-control border px-3 py-2 text-sm font-semibold transition-colors duration-(--motion-fast) ease-(--motion-ease-standard) hover:no-underline',
                current
                  ? 'border-control-selected-border bg-control-selected-background text-brand-primary'
                  : 'border-border-default text-content-secondary hover:border-border-strong hover:text-content-primary',
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      {/* Currency is a property of an OFFER, so it narrows the book only. A
          chip that silently did nothing on the other tab would be worse than
          one that is not there. */}
      {route.tab === 'market' && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={EXCHANGE_COPY.currencyGroupLabel}>
          <Chip
            label={EXCHANGE_COPY.allCurrencies}
            selected={route.currency === null}
            onClick={() => router.replace(exchangeHref({ ...route, currency: null }))}
          />
          {PAYOUT_CURRENCIES.map((currency) => (
            <Chip
              key={currency}
              label={currencyChipLabel(currency)}
              selected={route.currency === currency}
              onClick={() => router.replace(exchangeHref({ ...route, currency }))}
            />
          ))}
        </div>
      )}

      <ChainFilterChips
        value={route.chainId}
        onChange={(chainId) => router.replace(exchangeHref({ ...route, chainId }))}
      />

      <span className="flex-1" />

      {countLabel !== undefined && (
        <p className="font-numeric text-xs leading-4 text-content-tertiary">{countLabel}</p>
      )}
    </div>
  )
}
