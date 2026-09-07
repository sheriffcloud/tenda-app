'use client'

/**
 * Report triage (#92) — PATCH /v1/admin/reports/:id { status, admin_note }.
 * Acting on the CONTENT is separate by design (v2 reports route): hide the
 * listing on /escrows, suspend the owner on /users.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import type { Report, ReportStatus } from '@tenda/shared'
import { REPORT_STATUSES } from '@tenda/shared'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'

interface ReportActionDialogProps {
  report: Report | null
  onClose: () => void
  onActioned: () => void
}

function isReportStatus(v: string): v is ReportStatus {
  return (REPORT_STATUSES as readonly string[]).includes(v)
}

export function ReportActionDialog({ report, onClose, onActioned }: ReportActionDialogProps) {
  const [status, setStatus] = useState<ReportStatus>('reviewed')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (report === null) return
    setBusy(true)
    try {
      await adminApi.reports.action(report.id, {
        status,
        ...(note.trim() === '' ? {} : { admin_note: note.trim() }),
      })
      toast.success(`Report marked ${status}`)
      onActioned()
      onClose()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={report !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Action report</DialogTitle>
          <DialogDescription>
            {report?.reason} — to act on the content itself, hide the listing under
            Listings or suspend the owner under Users.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <NativeSelect
            value={status}
            onChange={(e) => {
              if (isReportStatus(e.target.value)) setStatus(e.target.value)
            }}
          >
            {REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Admin note (optional)"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
