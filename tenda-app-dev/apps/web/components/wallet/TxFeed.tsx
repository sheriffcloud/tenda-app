/**
 * The Activity section (Tier-3 comp, lines 669-711): day-grouped, role-scoped.
 *
 * WHICH rows arrive is the server's call (shared TX_FEED_VISIBILITY); the
 * shared tx-copy module words and SIGNS each row from the viewer's side, so
 * the same settlement reads "+50 USDC" to the worker and "−50 USDC" to the
 * poster. Never `actor_id`.
 *
 * Loading and empty are separate states, not one centred sentence. A feed that
 * could not be read saying "No activity yet" is the same lie this app has now
 * fixed on the gig feed and the notification centre.
 */
import {
  formatRelativeDayWithTime,
  txDisplayAmount,
  formatAmountOrUnknown,
  txLabel,
  txSign,
  viewerRole,
  type DayGroupHeader,
  type DayGroupItem,
  type UserEscrowTransaction,
} from '@tenda/shared'
import { Button } from '@/components/ui'
import { EmptyPanel } from '@/components/ui/EmptyPanel'
import { Receipt } from 'lucide-react'
import { cn } from '@/lib/cn'
import { WALLET_COPY } from './copy'

/** Exactly groupByDay's output — the shared types, never a local re-statement. */
type FeedEntry = DayGroupHeader<'tx'> | DayGroupItem<UserEscrowTransaction, 'tx'>

function TxRow({ tx, userId }: { tx: UserEscrowTransaction; userId: string }) {
  const role = viewerRole(tx, userId)
  const label = txLabel(tx.escrow.kind, tx.type, role)
  const sign = txSign(tx, role)
  const shown = txDisplayAmount(tx, role)
  return (
    <li className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-card px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold text-content-primary">{label}</span>
        <span className="truncate text-xs text-content-tertiary">
          {tx.escrow.title ?? 'Exchange'}
          {` · ${formatRelativeDayWithTime(tx.created_at)}`}
        </span>
      </div>
      {shown !== null && (
        <span
          className={cn(
            'font-numeric text-sm font-semibold',
            sign === '+' && 'text-numeric-positive',
            sign === '-' && 'text-numeric-negative',
            sign === null && 'text-content-secondary',
          )}
        >
          {sign ?? ''}
          {formatAmountOrUnknown(shown.amount, (v) =>
            v.toLocaleString('en-US', { maximumFractionDigits: 6 }),
          )}{' '}
          {shown.symbol}
        </span>
      )}
    </li>
  )
}

/** Six shimmering rows at the size the real ones will be — never a spinner. */
function FeedSkeleton() {
  return (
    <div aria-hidden className="flex animate-shimmer flex-col gap-2">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-[58px] rounded-card border border-border-subtle bg-surface-card" />
      ))}
    </div>
  )
}

export function TxFeed({
  feed,
  userId,
  total,
  isLoading,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  feed: FeedEntry[]
  userId: string
  /** Server total, so the count is not "what this page happens to hold". */
  total: number
  isLoading: boolean
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
}) {
  return (
    <section className="mt-9">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border-default pb-4">
        <h2 className="font-display text-xl font-semibold leading-[26px] text-content-primary">
          {WALLET_COPY.activity}
        </h2>
        {!isLoading && (
          <p className="font-numeric text-xs leading-4 text-content-tertiary">
            {WALLET_COPY.count(total)}
          </p>
        )}
      </div>

      <div className="mt-4">
        {isLoading && feed.length === 0 ? (
          <FeedSkeleton />
        ) : feed.length === 0 ? (
          <EmptyPanel
            icon={<Receipt size={28} />}
            title={WALLET_COPY.emptyTitle}
            body={WALLET_COPY.emptyBody}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {feed.map((entry) =>
              entry.type === 'day' ? (
                <li
                  key={entry.key}
                  className="pt-3 font-numeric text-xs font-bold uppercase leading-4 tracking-[0.08em] text-content-tertiary"
                >
                  {entry.label}
                </li>
              ) : (
                <TxRow key={entry.key} tx={entry.item} userId={userId} />
              ),
            )}
          </ul>
        )}

        {hasMore && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" size="md" disabled={isLoadingMore} onClick={onLoadMore}>
              {isLoadingMore ? WALLET_COPY.loadingMore : WALLET_COPY.loadMore}
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
