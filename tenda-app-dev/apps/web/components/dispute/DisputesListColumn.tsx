'use client'

/**
 * "My Disputes" as the workspace's list column — the second half of #16.
 *
 * Mounted by `@list/disputes` and `@list/dispute/[escrowId]`, so opening a
 * dispute swaps only the detail, exactly like the inbox.
 *
 * The Open|Resolved bucket lives in the URL, and that is not a style choice.
 * Next remounts a slot when the route moves between two of its entries, so a
 * bucket held in component state would reset to Open every time the reader
 * opened a RESOLVED dispute — the row they just clicked would vanish from the
 * list beside it. Row hrefs carry the bucket for the same reason.
 *
 * BOTH buckets load, not just the visible one (My Gigs' rule): an inactive
 * tab's count has to be a real server total, never a zero for a list nobody
 * fetched. Both ride the account-scoped `disputesPageCache`, so the remount
 * every opened row causes paints page zero instantly and revalidates
 * SILENTLY — no skeleton, no count flicker. (The revalidation request itself
 * still fires per mount; the cache saves the blink, not the round trip.)
 */
import { useMemo } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import type { MyDisputeRow as MyDisputeRowData, MyDisputeStatus } from '@tenda/shared'
import { ListColumn } from '@/components/app/workspace/list'
import { EscrowRow } from '@/components/app/workspace/rows'
import { Button } from '@/components/ui/Button'
import { useMyDisputes } from '@/hooks/dispute/useMyDisputes'
import { useCommandPalette } from '@/hooks/workspace/useCommandPalette'
import { DISPUTES_LIST_COPY, disputeBucket, disputesHref, disputeThreadHref } from './copy'

export function DisputesListColumn() {
  const search = useSearchParams()
  const params = useParams<{ escrowId?: string }>()
  const status: MyDisputeStatus = disputeBucket(search.get('status'))
  const open = useMyDisputes('open')
  const resolved = useMyDisputes('resolved')
  const list = status === 'open' ? open : resolved
  const { openPalette } = useCommandPalette()

  const groups = useMemo(
    () => [{ key: status, rows: list.items }],
    [status, list.items],
  )

  return (
    <ListColumn<MyDisputeRowData>
      copy={DISPUTES_LIST_COPY.surface(status)}
      groups={groups}
      keyOf={(row) => row.dispute_id}
      hrefOf={(row) => disputeThreadHref(row.escrow_id, status)}
      // The route carries the ESCROW id, not the dispute id — one dispute per
      // escrow, and /dispute/[escrowId] is what the thread is addressed by.
      selectedKey={useMemo(
        () => list.items.find((row) => row.escrow_id === params.escrowId)?.dispute_id,
        [list.items, params.escrowId],
      )}
      isLoading={list.isLoading}
      error={list.error}
      onRetry={() => void list.reload()}
      countLabel={list.hasFetched ? DISPUTES_LIST_COPY.count(list.total, status) : undefined}
      tabs={DISPUTES_LIST_COPY.tabs.map((tab) => ({
        href: disputesHref(tab.key),
        label: tab.label,
        count: countFor(tab.key, open, resolved),
        current: tab.key === status,
      }))}
      onOpenPalette={openPalette}
      footer={
        list.hasMore ? (
          <div className="px-3 pb-1">
            <Button
              variant="outline"
              size="md"
              fullWidth
              disabled={list.isLoadingMore}
              onClick={() => list.loadMore()}
            >
              {list.isLoadingMore ? DISPUTES_LIST_COPY.loadingMore : DISPUTES_LIST_COPY.loadMore}
            </Button>
          </div>
        ) : undefined
      }
      renderRow={(row, { active }) => (
        <EscrowRow
          href={disputeThreadHref(row.escrow_id, status)}
          title={row.subject_title ?? DISPUTES_LIST_COPY.untitled(row.kind)}
          status={row.status}
          subtitle={DISPUTES_LIST_COPY.subtitle(row)}
          at={row.raised_at}
          selected={active}
        />
      )}
    />
  )
}

/** A tab's chip count, or undefined until its OWN bucket has answered —
 *  "0 resolved" for a list nobody fetched is a claim (My Gigs' rule). */
function countFor(
  key: MyDisputeStatus,
  open: { total: number; hasFetched: boolean },
  resolved: { total: number; hasFetched: boolean },
): number | undefined {
  const list = key === 'open' ? open : resolved
  return list.hasFetched ? list.total : undefined
}
