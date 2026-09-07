'use client'

/** Announcements CRUD (#93) — title+body banners with priority/active/expiry. */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Announcement } from '@tenda/shared'
import { AppHeader } from '@/components/layout/header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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

export default function AnnouncementsPage() {
  const [rows, setRows] = useState<Announcement[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState('0')
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey((k) => k + 1)

  useEffect(() => {
    let alive = true
    adminApi.announcements
      .list({ limit: 50 })
      .then((res) => {
        if (alive) setRows(res.data)
      })
      .catch((err: unknown) => {
        if (alive) toast.error(err instanceof ApiError ? err.message : 'Failed to load announcements')
      })
    return () => {
      alive = false
    }
  }, [refreshKey])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await adminApi.announcements.create({
        title: title.trim(),
        body: body.trim(),
        priority: Number(priority) || 0,
      })
      toast.success('Announcement published')
      setTitle('')
      setBody('')
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  async function setActive(row: Announcement, is_active: boolean) {
    try {
      await adminApi.announcements.update(row.id, { is_active })
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Update failed')
    }
  }

  async function remove(id: string) {
    try {
      await adminApi.announcements.remove(id)
      toast.success('Announcement deleted')
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed')
    }
  }

  return (
    <>
      <AppHeader title="Announcements" />
      <div className="flex flex-col gap-4 p-4">
        <form onSubmit={create} className="grid max-w-2xl gap-3 rounded-md border p-4">
          <div className="space-y-1">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="body">Body</Label>
            <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={3} required />
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="priority">Priority (0–2)</Label>
              <Input id="priority" type="number" min={0} max={2} value={priority} onChange={(e) => setPriority(e.target.value)} className="w-24" />
            </div>
            <Button type="submit" disabled={busy || title.trim() === '' || body.trim() === ''}>
              Publish
            </Button>
          </div>
        </form>

        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No announcements.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Delete</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <p className="font-medium">{a.title}</p>
                    <p className="max-w-md truncate text-xs text-muted-foreground">{a.body}</p>
                  </TableCell>
                  <TableCell><Badge variant="outline">{a.priority}</Badge></TableCell>
                  <TableCell>
                    <Switch checked={a.is_active} onCheckedChange={(v) => void setActive(a, v)} />
                  </TableCell>
                  <TableCell>
                    {a.expires_at === null ? 'never' : formatAdminDateTime(a.expires_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="destructive" onClick={() => void remove(a.id)}>
                      Delete
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
