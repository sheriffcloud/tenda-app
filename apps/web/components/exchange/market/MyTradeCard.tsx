'use client'

/**
 * One row of "My trades" — the reader's own exchange escrows, from
 * `/v1/users/:id/escrows?kind=exchange`.
 *
 * That endpoint answers `EscrowListRow`, whose `title` is documented as NULL
 * for exchanges (it is `gig_details.title`). The previous row printed exactly
 * that field, so every trade in this list had a blank headline. A trade's
 * headline is its money: what is locked, and which currency it settles in.
 *
 * The rate is NOT here, and cannot be: this wire carries no `rate` or
 * `fiat_amount`. The offer page has both.
 */
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { formatAssetAmount, type EscrowListRow } from '@tenda/shared'
import { ChainBadge } from '@/components/shared/ChainBadge'
import { RelativeTime } from '@/components/ui/RelativeTime'
import { ExchangeStatusBadge } from '@/components/escrow/StatusBadge'
import { cn } from '@/lib/cn'
import { EXCHANGE_COPY, EXCHANGE_ROW_CLASS } from './copy'

export function MyTradeCard({ row, userId }: { row: EscrowListRow; userId: string }) {
  const selling = row.creator_id === userId
  const amount = formatAssetAmount(row.amount_raw, row.asset)

  return (
    <Link
      href={`/exchange/${row.id}`}
      className={cn(EXCHANGE_ROW_CLASS, 'flex items-center gap-4')}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2 font-numeric type-title text-content-primary">
          {amount}
          {row.fiat_currency !== null && (
            <>
              <span aria-hidden className="text-content-tertiary">
                →
              </span>
              <span className="text-content-secondary">{row.fiat_currency}</span>
            </>
          )}
        </span>
        {/* The chain as the shared badge (#60), so it reads the same here as
            on every card; wraps rather than truncating so the pill is never
            cut in half. */}
        <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 type-body-small text-content-secondary">
          {EXCHANGE_COPY.side(selling)}
          <span aria-hidden>·</span>
          <ChainBadge chainId={row.chain_id} size="sm" />
          <span aria-hidden>·</span>
          <RelativeTime iso={row.created_at} />
        </span>
      </span>
      <ExchangeStatusBadge status={row.status} />
      <ChevronRight size={18} aria-hidden className="shrink-0 text-content-tertiary" />
    </Link>
  )
}
