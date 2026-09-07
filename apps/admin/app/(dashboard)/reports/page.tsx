'use client'

/** Report queue (#92) — status-filtered triage over GET /v1/admin/reports. */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Report, ReportStatus } from '@tenda/shared'
import { REPORT_STATUSES } from '@tenda/shared'
import { AppHeader } from '@/components/layout/header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ListPagination } from '@/components/common/list-pagination'
import { ReportActionDialog } from '@/components/reports/action-dialog'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'
import { formatAdminDateTime } from '@/lib/date-format'

const PAGE_SIZE = 20
type Tab = ReportStatus | 'all'

function isTab(v: string): v is Tab {
  return v === 'all' || (REPORT_STATUSES as readonly string[]).includes(v)
}

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('pending')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Report[]>([])
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Report | null>(null)

  // setState lives in the .then callbacks (react-hooks/set-state-in-effect);
  // refreshKey bumps re-run the fetch after a report is actioned.
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey((k) => k + 1)

  useEffect(() => {
    let alive = true
    adminApi.reports
      .list({
        ...(tab === 'all' ? {} : { status: tab }),
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })
      .then((res) => {
        if (!alive) return
        setRows(res.data)
        setTotal(res.total)
      })
      .catch((err: unknown) => {
        if (alive) toast.error(err instanceof ApiError ? err.message : 'Failed to load reports')
      })
    return () => {
      alive = false
    }
  }, [tab, page, refreshKey])

  return (
    <>
      <AppHeader title="Reports" />
      <div className="flex flex-col gap-4 p-4">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            if (!isTab(v)) return
            setTab(v)
            setPage(1)
          }}
        >
          <TabsList>
            {(['pending', 'reviewed', 'actioned', 'dismissed', 'all'] as const).map((t) => (
              <TabsTrigger key={t} value={t} className="capitalize">
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No reports here.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reason</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Filed</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-medium">{r.reason}</p>
                    {r.note !== null && (
                      <p className="max-w-md truncate text-xs text-muted-foreground">{r.note}</p>
                    )}
                  </TableCell>
                  <TableCell className="capitalize">{r.content_type}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === 'pending' ? 'destructive' : 'outline'}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatAdminDateTime(r.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setSelected(r)}>
                      Action
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <ListPagination
          page={page}
          totalPages={Math.ceil(total / PAGE_SIZE)}
          onPageChange={setPage}
        />
      </div>

      <ReportActionDialog
        report={selected}
        onClose={() => setSelected(null)}
        onActioned={refresh}
      />
    </>
  )
}
