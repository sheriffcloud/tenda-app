'use client'

/**
 * Fee revenue (#93) — GET /v1/admin/finance/fees with an optional date
 * range. Amounts are RAW base-unit strings (numeric(78,0) — kept as text
 * to avoid JS number overflow) and rendered verbatim.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { FinanceFeesResponse } from '@tenda/shared'
import { AppHeader } from '@/components/layout/header'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'
import { formatAdminDate } from '@/lib/date-format'

export default function FinancePage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [fees, setFees] = useState<FinanceFeesResponse | null>(null)

  useEffect(() => {
    let alive = true
    adminApi.finance
      .fees({ ...(from !== '' ? { from } : {}), ...(to !== '' ? { to } : {}) })
      .then((res) => {
        if (alive) setFees(res)
      })
      .catch((err: unknown) => {
        if (alive) toast.error(err instanceof ApiError ? err.message : 'Failed to load fees')
      })
    return () => {
      alive = false
    }
  }, [from, to])

  return (
    <>
      <AppHeader title="Finance" />
      <div className="flex flex-col gap-4 p-4">
        <div className="flex gap-3">
          <div className="space-y-1">
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        {fees === null ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Period {formatAdminDate(fees.period.from)} –{' '}
              {formatAdminDate(fees.period.to)} · grand total fee (raw base units):{' '}
              <span className="font-mono font-medium text-foreground">{fees.grand_total_fee_raw}</span>
            </p>
            {(['gig', 'exchange'] as const).map((kind) => (
              <div key={kind} className="rounded-md border">
                <p className="border-b px-4 py-2 text-sm font-medium capitalize">{kind} fees</p>
                {fees.by_kind[kind].by_type.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No transactions in range.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Count</TableHead>
                        <TableHead>Total fee (raw)</TableHead>
                        <TableHead>Total amount (raw)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fees.by_kind[kind].by_type.map((row) => (
                        <TableRow key={row.type}>
                          <TableCell>{row.type}</TableCell>
                          <TableCell>{row.transaction_count}</TableCell>
                          <TableCell className="font-mono">{row.total_platform_fee}</TableCell>
                          <TableCell className="font-mono">{row.total_amount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </>
  )
}
