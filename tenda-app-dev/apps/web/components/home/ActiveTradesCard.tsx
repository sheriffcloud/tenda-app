'use client'

/**
 * Active trades (#60): the reader's own exchange escrows still in flight —
 * `useMyTrades`, the same list the Trade surface's "My trades" tab reads.
 * This slot held "Recent activity" in the first preview; it was dropped
 * because every settlement row of the tx ledger also arrives as a
 * notification, and two lists of the same events is one too many.
 *
 * A row is `EscrowListRow`: money, fiat currency, chain, status, when. No
 * counterparty name — the list wire carries none.
 */
import { formatAssetAmount, type EscrowListRow } from '@tenda/shared'
import { ExchangeStatusBadge } from '@/components/escrow/StatusBadge'
import { ChainBadge } from '@/components/shared/ChainBadge'
import { RelativeTime } from '@/components/ui/RelativeTime'
import type { PaginatedListState } from '@/hooks/pagination/usePaginatedList'
import { HOME_COPY } from './copy'
import { DashCard, DashEmpty, DashPill, DashRow, DashRows } from './primitives'

/** Statuses that mean money is still locked and someone still owes a step. */
const IN_FLIGHT = new Set<EscrowListRow['status']>(['open', 'accepted', 'submitted'])

/** How many rows the card shows before "Trade →". */
export const TRADES_RECENT = 3

export const TRADE_HREF = '/exchange'

export function ActiveTradesCard({
  trades,
  userId,
}: {
  trades: PaginatedListState<EscrowListRow>
  userId: string
}) {
  const active = trades.items.filter((row) => IN_FLIGHT.has(row.status))
  const recent = active.slice(0, TRADES_RECENT)
  return (
    <DashCard
      title={HOME_COPY.trades.title}
      pill={
        trades.hasFetched ? (
          <DashPill dot={active.length > 0 ? 'live' : 'quiet'}>{HOME_COPY.trades.inFlight(active.length)}</DashPill>
        ) : undefined
      }
      more={{ href: TRADE_HREF, label: HOME_COPY.trades.more }}
    >
      {recent.length === 0 ? (
        <DashEmpty>{HOME_COPY.trades.empty}</DashEmpty>
      ) : (
        <DashRows>
          {recent.map((row) => {
            const amount = formatAssetAmount(row.amount_raw, row.asset)
            const selling = row.creator_id === userId
            return (
              <DashRow
                key={row.id}
                href={`${TRADE_HREF}/${row.id}`}
                title={
                  <>
                    {amount}
                    {row.fiat_currency !== null && (
                      <>
                        <span aria-hidden className="text-content-tertiary">
                          {' → '}
                        </span>
                        {row.fiat_currency}
                      </>
                    )}
                  </>
                }
                subtitle={
                  <>
                    {selling ? HOME_COPY.trades.side.selling : HOME_COPY.trades.side.buying}
                    <span aria-hidden>·</span>
                    <ChainBadge chainId={row.chain_id} size="sm" />
                    <span aria-hidden>·</span>
                    <RelativeTime iso={row.created_at} className="font-numeric" />
                  </>
                }
                badge={<ExchangeStatusBadge status={row.status} />}
                trailing={amount}
                muted={row.status === 'open'}
              />
            )
          })}
        </DashRows>
      )}
    </DashCard>
  )
}
