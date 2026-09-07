'use client'

/**
 * The one list renderer over usePaginatedList state — web analogue of
 * mobile's ui/PaginatedList, shared by disputes / my-gigs / exchange.
 * Convention carried over: a populated list is NEVER swapped for a
 * skeleton — the spinner shows only before the first page lands, and
 * errors replace the list only when there is nothing to show.
 *
 * Three optional slots, all defaulting to what this already did:
 *   - `skeleton` — mobile's parity slot. A shimmer of the rows about to land
 *     tells the reader what is coming; a centred spinner tells them to wait.
 *   - `listLabel` — renders the rows as a NAMED `ul`/`li`. Without it they
 *     stay bare divs, because a "list" of one card per screen is noise to a
 *     screen reader, and existing callers should not silently gain landmarks.
 *   - `errorBody` — the comps' failure copy, which says what is NOT broken
 *     ("your balance and any open trade are unaffected"). The server's own
 *     message is the fallback, so a caller that supplies neither still says
 *     something specific.
 */
import type { ReactNode } from 'react'
import { AlertPanel, ALERT_ACTION_CLASS } from '@/components/ui/AlertPanel'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import type { PaginatedListState } from '@/hooks/pagination/usePaginatedList'

export const PAGINATED_LIST_COPY = {
  retry: 'Try again',
  loadMore: 'Load more',
  loadingMore: 'Loading…',
  errorTitle: 'Could not load the list',
  errorBody: 'Nothing has changed. This is a read failure, and retrying is safe.',
} as const

export function PaginatedList<TItem>({
  list,
  keyOf,
  renderItem,
  empty,
  skeleton,
  listLabel,
  errorTitle = PAGINATED_LIST_COPY.errorTitle,
  errorBody,
}: {
  list: PaginatedListState<TItem>
  keyOf: (item: TItem) => string
  renderItem: (item: TItem) => ReactNode
  empty: ReactNode
  skeleton?: ReactNode
  listLabel?: string
  errorTitle?: string
  errorBody?: string
}) {
  if (!list.hasFetched && list.error === null) {
    if (skeleton !== undefined) return <>{skeleton}</>
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  if (list.error !== null && list.items.length === 0) {
    return (
      <AlertPanel
        title={errorTitle}
        // The server's message when the caller has no reassurance to offer —
        // never dropped, because "could not load" alone is not diagnosable.
        body={errorBody ?? (list.error || PAGINATED_LIST_COPY.errorBody)}
        action={
          <button type="button" onClick={() => void list.refresh()} className={ALERT_ACTION_CLASS}>
            {PAGINATED_LIST_COPY.retry}
          </button>
        }
      />
    )
  }

  if (list.items.length === 0) return <>{empty}</>

  const rows = list.items.map((item) =>
    listLabel === undefined ? (
      <div key={keyOf(item)}>{renderItem(item)}</div>
    ) : (
      <li key={keyOf(item)}>{renderItem(item)}</li>
    ),
  )

  return (
    <div className="flex flex-col gap-3">
      {listLabel === undefined ? (
        rows
      ) : (
        <ul aria-label={listLabel} className="flex flex-col gap-3">
          {rows}
        </ul>
      )}
      {list.hasMore && (
        <div className="flex justify-center py-3">
          <Button variant="outline" disabled={list.isLoadingMore} onClick={() => list.loadMore()}>
            {list.isLoadingMore ? PAGINATED_LIST_COPY.loadingMore : PAGINATED_LIST_COPY.loadMore}
          </Button>
        </div>
      )}
    </div>
  )
}
