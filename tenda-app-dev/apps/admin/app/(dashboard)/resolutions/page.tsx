'use client'

/**
 * Resolution signing queue (Issue-3) — proposals awaiting a key-holder's
 * signature. Rows open the dispute where the proposal is reviewed and
 * signed / rejected. Nav-gated on disputes.execute (the signer's worklist).
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { ResolutionQueueRow } from '@tenda/shared'
import { AppHeader } from '@/components/layout/header'
import { ResolutionQueueTable } from '@/components/disputes/resolution/resolution-queue-table'
import { ListPagination } from '@/components/common/list-pagination'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'

const PAGE_SIZE = 20

export default function ResolutionsPage() {
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<ResolutionQueueRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    adminApi.resolutions
      .queue({ status: 'pending', limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      .then((res) => {
        if (!alive) return
        setRows(res.data)
        setTotal(res.total)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (!alive) return
        setLoading(false)
        toast.error(err instanceof ApiError ? err.message : 'Failed to load the queue')
      })
    return () => {
      alive = false
    }
  }, [page])

  return (
    <>
      <AppHeader title="Resolutions" />
      <div className="flex flex-col gap-4 p-4">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ResolutionQueueTable rows={rows} />
        )}
        <ListPagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} onPageChange={setPage} />
      </div>
    </>
  )
}
