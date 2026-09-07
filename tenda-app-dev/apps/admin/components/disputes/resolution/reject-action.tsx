'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'

/**
 * Returns an active proposal to the mediator with a reason (the multisig
 * "reject" vote later). Reveals an inline reason box, so the key-holder must
 * say why before the proposal reopens. Shown only to disputes.execute holders.
 */
export function RejectAction({ resolutionId, onRejected }: { resolutionId: string; onRejected: () => void }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const trimmed = reason.trim()
    if (trimmed === '') return
    setBusy(true)
    try {
      await adminApi.resolutions.reject(resolutionId, trimmed)
      toast.success('Proposal returned to the mediator')
      onRejected()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not reject the proposal')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Reject
      </Button>
    )
  }
  return (
    <div className="space-y-2">
      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why is this proposal wrong?"
        rows={2}
        disabled={busy}
      />
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" onClick={submit} disabled={busy || reason.trim() === ''}>
          Confirm reject
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
