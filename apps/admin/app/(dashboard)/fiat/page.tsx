'use client'

/**
 * Fiat rails ops (#93/stage-8) — intent triage (force-settle / refund
 * with a mandatory audited reason) + provider enable toggles.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AppHeader } from '@/components/layout/header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
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
import { adminApi, type FiatIntentRow, type FiatProviderRow } from '@/api/client'
import { ApiError } from '@/lib/api'
import { formatAdminDateTime } from '@/lib/date-format'

type Override = { intent: FiatIntentRow; action: 'force-settle' | 'refund' }

export default function FiatPage() {
  const [status, setStatus] = useState('')
  const [intents, setIntents] = useState<FiatIntentRow[]>([])
  const [providers, setProviders] = useState<FiatProviderRow[]>([])
  const [override, setOverride] = useState<Override | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey((k) => k + 1)

  useEffect(() => {
    let alive = true
    Promise.all([
      adminApi.fiat.intents(status !== '' ? { status } : {}),
      adminApi.fiat.providers(),
    ])
      .then(([i, p]) => {
        if (!alive) return
        setIntents(i.intents)
        setProviders(p.providers)
      })
      .catch((err: unknown) => {
        if (alive) toast.error(err instanceof ApiError ? err.message : 'Failed to load fiat data')
      })
    return () => {
      alive = false
    }
  }, [status, refreshKey])

  async function submitOverride() {
    if (override === null || reason.trim() === '') return
    setBusy(true)
    try {
      await (override.action === 'force-settle'
        ? adminApi.fiat.forceSettle(override.intent.id, reason.trim())
        : adminApi.fiat.refund(override.intent.id, reason.trim()))
      toast.success(`Intent ${override.action === 'force-settle' ? 'settled' : 'refunded'}`)
      setOverride(null)
      setReason('')
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Override failed')
    } finally {
      setBusy(false)
    }
  }

  async function toggleProvider(p: FiatProviderRow, is_enabled: boolean) {
    try {
      await adminApi.fiat.updateProvider(p.id, { is_enabled })
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Provider update failed')
    }
  }

  return (
    <>
      <AppHeader title="Fiat Rails" />
      <div className="flex flex-col gap-4 p-4">
        <div className="rounded-md border">
          <p className="border-b px-4 py-2 text-sm font-medium">Providers</p>
          {providers.map((p) => (
            <div key={p.id} className="flex items-center gap-3 border-b px-4 py-2 text-sm last:border-b-0">
              <span className="flex-1">{p.display_name} <span className="text-muted-foreground">({p.id} · priority {p.priority})</span></span>
              <Switch checked={p.is_enabled} onCheckedChange={(v) => void toggleProvider(p, v)} />
            </div>
          ))}
        </div>

        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
          <option value="">All intent statuses</option>
          {['quoted', 'awaiting_user', 'awaiting_provider', 'settling', 'settled', 'failed', 'refunded'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </NativeSelect>

        {intents.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No intents match.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Direction</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Override</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {intents.map((i) => {
                const terminal = i.status === 'settled' || i.status === 'failed' || i.status === 'refunded'
                return (
                  <TableRow key={i.id}>
                    <TableCell className="capitalize">{i.direction}</TableCell>
                    <TableCell>
                      {i.fiat_amount} {i.fiat_currency}
                      <p className="font-mono text-xs text-muted-foreground">{i.asset_amount_raw} {i.asset}</p>
                    </TableCell>
                    <TableCell>{i.provider}</TableCell>
                    <TableCell><Badge variant={terminal ? 'outline' : 'secondary'}>{i.status}</Badge></TableCell>
                    <TableCell>{formatAdminDateTime(i.created_at)}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button size="sm" variant="outline" disabled={terminal} onClick={() => setOverride({ intent: i, action: 'force-settle' })}>
                        Settle
                      </Button>
                      <Button size="sm" variant="destructive" disabled={terminal} onClick={() => setOverride({ intent: i, action: 'refund' })}>
                        Refund
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={override !== null} onOpenChange={(open) => !open && setOverride(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {override?.action === 'force-settle' ? 'Force-settle intent' : 'Refund intent'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {override?.intent.fiat_amount} {override?.intent.fiat_currency} ·{' '}
            {override?.intent.provider}. A reason is required — it lands in the intent metadata
            as an admin override.
          </p>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the manual override?" rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverride(null)} disabled={busy}>Cancel</Button>
            <Button
              variant={override?.action === 'refund' ? 'destructive' : 'default'}
              onClick={() => void submitOverride()}
              disabled={busy || reason.trim() === ''}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
