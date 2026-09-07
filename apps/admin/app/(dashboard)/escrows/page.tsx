'use client'

/**
 * Listings triage (#92) — unified gig + exchange rows over
 * GET /v1/admin/escrows, with the CO1 takedown toggle
 * (PATCH /:id/hidden). Hidden listings stay transactable for existing
 * parties; they just leave the public surfaces.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { displayName, type AdminEscrowRow } from '@tenda/shared'
import { AppHeader } from '@/components/layout/header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ListPagination } from '@/components/common/list-pagination'
import { EscrowStatusBadge } from '@/components/common/status-badge'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { adminApi, type EscrowListAdminQuery } from '@/api/client'
import { ApiError } from '@/lib/api'

const PAGE_SIZE = 20

export default function EscrowsPage() {
  const [kind, setKind] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<AdminEscrowRow[]>([])
  const [total, setTotal] = useState(0)
  const [pendingHide, setPendingHide] = useState<AdminEscrowRow | null>(null)

  // setState lives in the .then callbacks (react-hooks/set-state-in-effect);
  // refreshKey bumps re-run the fetch after a takedown toggle.
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey((k) => k + 1)

  useEffect(() => {
    let alive = true
    const query: EscrowListAdminQuery = { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }
    if (kind === 'gig' || kind === 'exchange') query.kind = kind
    if (status !== '') query.status = status
    adminApi.escrows
      .list(query)
      .then((res) => {
        if (!alive) return
        setRows(res.data)
        setTotal(res.total)
      })
      .catch((err: unknown) => {
        if (alive) toast.error(err instanceof ApiError ? err.message : 'Failed to load listings')
      })
    return () => {
      alive = false
    }
  }, [kind, status, page, refreshKey])

  async function toggleHidden(row: AdminEscrowRow) {
    try {
      await adminApi.escrows.setHidden(row.id, !row.hidden)
      toast.success(row.hidden ? 'Listing restored' : 'Listing hidden')
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Takedown failed')
    }
  }

  return (
    <>
      <AppHeader title="Listings" />
      <div className="flex flex-col gap-4 p-4">
        <div className="flex gap-2">
          <NativeSelect value={kind} onChange={(e) => { setKind(e.target.value); setPage(1) }} className="w-40">
            <option value="">All kinds</option>
            <option value="gig">Gigs</option>
            <option value="exchange">Exchange</option>
          </NativeSelect>
          <NativeSelect value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="w-40">
            <option value="">All statuses</option>
            {['draft', 'open', 'accepted', 'submitted', 'completed', 'cancelled', 'refunded', 'disputed', 'resolved'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </NativeSelect>
        </div>

        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No listings match.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Creator</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead className="text-right">Takedown</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {row.title ?? 'Exchange offer'}
                    {row.city !== null && (
                      <p className="text-xs text-muted-foreground">{row.city}, {row.country}</p>
                    )}
                  </TableCell>
                  <TableCell className="capitalize">{row.kind}</TableCell>
                  <TableCell>
                    {displayName(row.creator_first_name, row.creator_last_name, row.creator_id)}
                  </TableCell>
                  <TableCell>
                    {row.dispute_id !== null ? (
                      <Link
                        href={`/disputes/${row.dispute_id}`}
                        className="rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2"
                        title="Open this dispute"
                      >
                        <EscrowStatusBadge status={row.status} />
                      </Link>
                    ) : (
                      <EscrowStatusBadge status={row.status} />
                    )}
                  </TableCell>
                  <TableCell>
                    {row.hidden ? <Badge variant="destructive">hidden</Badge> : <Badge variant="outline">public</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.hidden ? (
                      <Button size="sm" variant="outline" onClick={() => void toggleHidden(row)}>
                        Restore
                      </Button>
                    ) : (
                      <Button size="sm" variant="destructive" onClick={() => setPendingHide(row)}>
                        Hide
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <ListPagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} onPageChange={setPage} />
      </div>

      <ConfirmDialog
        open={pendingHide !== null}
        onOpenChange={(open) => !open && setPendingHide(null)}
        title="Hide this listing?"
        description="It leaves all public surfaces immediately; existing parties can still transact. You can restore it any time."
        confirmLabel="Hide listing"
        variant="destructive"
        onConfirm={() => {
          if (pendingHide !== null) void toggleHidden(pendingHide)
          setPendingHide(null)
        }}
      />
    </>
  )
}
