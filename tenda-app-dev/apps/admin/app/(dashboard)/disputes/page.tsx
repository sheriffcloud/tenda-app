'use client'

/**
 * Dispute queue (#91) — Pool (unclaimed) / Mine (my caseload) / All over
 * GET /v1/admin/disputes. Claim/release inline; rows open the mediation
 * thread. A `?party=<userId>` deep-link (from user detail / listings) narrows
 * every view to one user's disputes.
 */

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import type { DisputeListQuery, DisputeSummary } from '@tenda/shared'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AppHeader } from '@/components/layout/header'
import { DisputeTable } from '@/components/disputes/dispute-table'
import { ListPagination } from '@/components/common/list-pagination'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'
import { useSessionUser } from '@/lib/use-session'

const PAGE_SIZE = 20
type Tab = 'pool' | 'mine' | 'all'

const TAB_QUERY: Record<Tab, DisputeListQuery> = {
  // Pool/Mine are the actionable views — open disputes only.
  pool: { assigned: 'none', status: 'open' },
  mine: { assigned: 'me', status: 'open' },
  all: {},
}

function isTab(v: string): v is Tab {
  return v === 'pool' || v === 'mine' || v === 'all'
}

function DisputesQueue() {
  const party = useSearchParams().get('party') ?? undefined
  // A party deep-link is a history view, so default to the unfiltered tab.
  const [tab, setTab] = useState<Tab>(party !== undefined ? 'all' : 'pool')
  const [page, setPage] = useState(1) // ListPagination is 1-based
  const [rows, setRows] = useState<DisputeSummary[]>([])
  const [total, setTotal] = useState(0)
  const meId = useSessionUser()?.id ?? ''

  // setState lives in the .then callbacks (react-hooks/set-state-in-effect);
  // refreshKey bumps re-run the fetch after mutations.
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey((k) => k + 1)

  // Loading is DERIVED, not stored. Writing it synchronously inside the effect
  // trips the same set-state-in-effect rule (cascading renders); the key
  // changes during the render that queues the next fetch, so the spinner
  // appears without an extra state write and clears when that fetch settles.
  const requestKey = JSON.stringify([tab, page, refreshKey, party])
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const loading = loadedKey !== requestKey

  useEffect(() => {
    let alive = true
    adminApi.disputes
      .list({ ...TAB_QUERY[tab], party, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      .then((res) => {
        if (!alive) return
        setRows(res.data)
        setTotal(res.total)
        setLoadedKey(requestKey)
      })
      .catch((err: unknown) => {
        if (!alive) return
        setLoadedKey(requestKey)
        toast.error(err instanceof ApiError ? err.message : 'Failed to load disputes')
      })
    return () => {
      alive = false
    }
  }, [tab, page, refreshKey, party, requestKey])

  return (
    <>
      <AppHeader title="Disputes" />
      <div className="flex flex-col gap-4 p-4">
        {party !== undefined && (
          <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Filtered to one user&apos;s disputes.</span>
            <Link href="/disputes" className="underline underline-offset-2 hover:no-underline">
              Clear filter
            </Link>
          </div>
        )}

        <Tabs
          value={tab}
          onValueChange={(v) => {
            if (!isTab(v)) return
            setTab(v)
            setPage(1)
          }}
        >
          <TabsList>
            <TabsTrigger value="pool">Pool</TabsTrigger>
            <TabsTrigger value="mine">My caseload</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <DisputeTable disputes={rows} meId={meId} onChanged={refresh} />
        )}

        <ListPagination
          page={page}
          totalPages={Math.ceil(total / PAGE_SIZE)}
          onPageChange={setPage}
        />
      </div>
    </>
  )
}

export default function DisputesPage() {
  // useSearchParams needs a Suspense boundary (Next 16 CSR-bailout rule).
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading…</p>}>
      <DisputesQueue />
    </Suspense>
  )
}
