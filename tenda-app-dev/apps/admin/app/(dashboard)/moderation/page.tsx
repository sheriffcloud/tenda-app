'use client'

/**
 * Moderation verdicts (#93/stage-6) — decision-filtered queue over
 * GET /v1/admin/moderation/verdicts; override (with a mandatory reason)
 * flips a warn/block decision via the audited override route.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AppHeader } from '@/components/layout/header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { adminApi, type ModerationVerdictRow } from '@/api/client'
import { ApiError } from '@/lib/api'
import { formatAdminDateTime } from '@/lib/date-format'

function decisionVariant(d: ModerationVerdictRow['decision']) {
  return d === 'block' ? 'destructive' : d === 'warn' ? 'secondary' : 'outline'
}

export default function ModerationPage() {
  const [decision, setDecision] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<ModerationVerdictRow[]>([])
  const [overriding, setOverriding] = useState<ModerationVerdictRow | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let alive = true
    adminApi.moderation
      .verdicts({ ...(decision !== '' ? { decision } : {}), page })
      .then((res) => {
        if (alive) setRows(res.verdicts)
      })
      .catch((err: unknown) => {
        if (alive) toast.error(err instanceof ApiError ? err.message : 'Failed to load verdicts')
      })
    return () => {
      alive = false
    }
  }, [decision, page, refreshKey])

  async function submitOverride() {
    if (overriding === null || reason.trim() === '') return
    setBusy(true)
    try {
      await adminApi.moderation.override(overriding.id, reason.trim())
      toast.success('Verdict overridden')
      setOverriding(null)
      setReason('')
      setRefreshKey((k) => k + 1)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Override failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AppHeader title="Moderation" />
      <div className="flex flex-col gap-4 p-4">
        <NativeSelect value={decision} onChange={(e) => { setDecision(e.target.value); setPage(0) }} className="w-40">
          <option value="">All decisions</option>
          <option value="approve">approve</option>
          <option value="warn">warn</option>
          <option value="block">block</option>
        </NativeSelect>

        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No verdicts here.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="text-right">Override</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <p className="font-medium">{v.subject_kind}</p>
                    <p className="max-w-md truncate text-xs text-muted-foreground">
                      {JSON.stringify(v.reasons)}
                    </p>
                  </TableCell>
                  <TableCell><Badge variant={decisionVariant(v.decision)}>{v.decision}</Badge></TableCell>
                  <TableCell>{v.provider}{v.model !== null ? ` · ${v.model}` : ''}</TableCell>
                  <TableCell>{formatAdminDateTime(v.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setOverriding(v)}>
                      Override
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>

      <Dialog open={overriding !== null} onOpenChange={(open) => !open && setOverriding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override verdict</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Overriding flips this {overriding?.decision} decision. A reason is required — it lands
            in the audit trail.
          </p>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is the verdict wrong?" rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverriding(null)} disabled={busy}>Cancel</Button>
            <Button onClick={() => void submitOverride()} disabled={busy || reason.trim() === ''}>
              Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
