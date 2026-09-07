'use client'

/**
 * Push broadcast (#93) — POST /v1/admin/push/broadcast. Sending is
 * IRREVERSIBLE and rate-limited server-side (10/hour); a confirm dialog
 * guards every send.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import type { PushBroadcastTarget } from '@tenda/shared'
import { AppHeader } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'

const TARGETS: ReadonlyArray<PushBroadcastTarget> = ['all', 'role', 'country', 'city']

function isTarget(v: string): v is PushBroadcastTarget {
  return (TARGETS as readonly string[]).includes(v)
}

export default function PushPage() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [target, setTarget] = useState<PushBroadcastTarget>('all')
  const [targetValue, setTargetValue] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const valid =
    title.trim() !== '' && body.trim() !== '' && (target === 'all' || targetValue.trim() !== '')

  async function send() {
    setBusy(true)
    try {
      const res = await adminApi.push.broadcast({
        title: title.trim(),
        body: body.trim(),
        target,
        ...(target === 'all' ? {} : { target_value: targetValue.trim() }),
      })
      toast.success(`Broadcast queued to ${res.attempted} device tokens`)
      setTitle('')
      setBody('')
      setTargetValue('')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Broadcast failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AppHeader title="Push Notifications" />
      <div className="p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setConfirming(true)
          }}
          className="grid max-w-xl gap-3 rounded-md border p-4"
        >
          <div className="space-y-1">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="body">Body</Label>
            <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} required />
          </div>
          <div className="flex gap-2">
            <div className="space-y-1">
              <Label htmlFor="target">Target</Label>
              <NativeSelect
                id="target"
                value={target}
                onChange={(e) => {
                  if (isTarget(e.target.value)) setTarget(e.target.value)
                }}
                className="w-36"
              >
                {TARGETS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </NativeSelect>
            </div>
            {target !== 'all' && (
              <div className="flex-1 space-y-1">
                <Label htmlFor="tv">
                  {target === 'role' ? 'Role' : target === 'country' ? 'Country code' : 'City'}
                </Label>
                <Input id="tv" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} required />
              </div>
            )}
          </div>
          <Button type="submit" disabled={busy || !valid}>
            Send broadcast…
          </Button>
          <p className="text-xs text-muted-foreground">
            Rate-limited to 10 broadcasts per hour. Sends cannot be recalled.
          </p>
        </form>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Send this broadcast?"
        description={`"${title.trim()}" goes to ${target === 'all' ? 'EVERY registered device' : `${target}: ${targetValue.trim()}`}. This cannot be recalled.`}
        confirmLabel="Send now"
        variant="destructive"
        loading={busy}
        onConfirm={() => {
          setConfirming(false)
          void send()
        }}
      />
    </>
  )
}
