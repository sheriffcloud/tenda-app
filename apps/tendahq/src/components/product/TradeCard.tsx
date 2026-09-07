import { ChevronRight } from 'lucide-react'
import { Pill } from '@/components/ui/Pill'
import { CURRENCIES } from '@/data/currencies'
import { chainByFamily, type ExampleTrade } from '@/content'
import { cn } from '@/lib/cn'

interface Props {
  trade: ExampleTrade
  className?: string
}

const FIAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/**
 * A showcased P2P corridor: the escrowed asset (with its chain) flowing into
 * local cash over a named payout rail. The animated dashed line IS the
 * offramp — value visibly moves left → right. Used by the TradeDeck.
 */
export function TradeCard({ trade, className }: Props) {
  const chain = chainByFamily(trade.asset.chainFamily)
  const fiat = CURRENCIES[trade.fiat.currency]

  return (
    <article
      className={cn(
        'flex flex-col gap-4 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-5',
        'shadow-[var(--shadow-card)]',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="brand" size="sm" dot>
          Escrow locked
        </Pill>
        <span className="mono-sm ml-auto text-[var(--content-tertiary)]">
          {trade.trader} · {trade.rating.toFixed(1)}★
        </span>
      </div>

      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <div className="flex flex-col gap-1.5">
          <p className="mono-mid text-[var(--content-primary)]">
            {trade.asset.amount} {trade.asset.symbol}
          </p>
          {chain && (
            <span className="mono-sm inline-flex items-center gap-1.5 text-[var(--content-tertiary)]">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: chain.color }}
              />
              on {chain.name}
            </span>
          )}
        </div>

        <div
          aria-hidden
          className="flex min-w-8 items-center gap-0.5 text-[var(--brand)]"
        >
          <span className="corridor-line flex-1" />
          <ChevronRight className="h-4 w-4 shrink-0" />
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <p className="mono-mid text-[var(--content-primary)]">
            {fiat.symbol}
            {FIAT.format(trade.fiat.amount)}
          </p>
          <span className="mono-sm inline-flex items-center gap-1.5 text-[var(--content-tertiary)]">
            {fiat.flag} {trade.fiat.currency} · {trade.fiat.rail}
          </span>
        </div>
      </div>
    </article>
  )
}
