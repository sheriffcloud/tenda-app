'use client'

/**
 * Featured rail curation (#93/CO8) — scheduled slots over
 * /v1/admin/featured. The rail itself filters at READ time (open, not
 * hidden, deadline live), so a slot whose gig dies simply drops out;
 * slots here are the schedule, not the visibility.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { FeaturedSlotRow } from '@tenda/shared'
import { AppHeader } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
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
import { formatAdminDateTime } from '@/lib/date-format'

/** datetime-local value → ISO; '' → null. */
function toIso(local: string): string | null {
  if (local === '') return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export default function FeaturedPage() {
  const [slots, setSlots] = useState<FeaturedSlotRow[]>([])
  const [escrowId, setEscrowId] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [position, setPosition] = useState('0')
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey((k) => k + 1)

  useEffect(() => {
    let alive = true
    adminApi.featured
      .list()
      .then((res) => {
        if (alive) setSlots(res.data)
      })
      .catch((err: unknown) => {
        if (alive) toast.error(err instanceof ApiError ? err.message : 'Failed to load slots')
      })
    return () => {
      alive = false
    }
  }, [refreshKey])

  async function createSlot(e: React.FormEvent) {
    e.preventDefault()
    const starts = toIso(startsAt)
    const ends = toIso(endsAt)
    if (starts === null || ends === null) {
      toast.error('Both window timestamps are required')
      return
    }
    setBusy(true)
    try {
      await adminApi.featured.create({
        escrow_id: escrowId.trim(),
        starts_at: starts,
        ends_at: ends,
        position: Number(position) || 0,
      })
      toast.success('Slot scheduled')
      setEscrowId('')
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create the slot')
    } finally {
      setBusy(false)
    }
  }

  async function removeSlot(id: string) {
    try {
      await adminApi.featured.remove(id)
      toast.success('Slot removed')
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove the slot')
    }
  }

  return (
    <>
      <AppHeader title="Featured" />
      <div className="flex flex-col gap-4 p-4">
        <form onSubmit={createSlot} className="grid gap-3 rounded-md border p-4 md:grid-cols-5">
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="escrow">Gig escrow id</Label>
            <Input id="escrow" value={escrowId} onChange={(e) => setEscrowId(e.target.value)} placeholder="escrow UUID (gigs only)" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="starts">Starts</Label>
            <Input id="starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ends">Ends</Label>
            <Input id="ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="pos">Position</Label>
              <Input id="pos" type="number" min={0} value={position} onChange={(e) => setPosition(e.target.value)} className="w-20" />
            </div>
            <Button type="submit" disabled={busy}>Schedule</Button>
          </div>
        </form>

        {slots.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No scheduled slots.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Listing</TableHead>
                <TableHead>Window</TableHead>
                <TableHead>Position</TableHead>
                <TableHead className="text-right">Remove</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slots.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.title ?? s.escrow_id}</TableCell>
                  <TableCell>
                    {formatAdminDateTime(s.starts_at)} → {formatAdminDateTime(s.ends_at)}
                  </TableCell>
                  <TableCell>{s.position}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="destructive" onClick={() => void removeSlot(s.id)}>
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  )
}
