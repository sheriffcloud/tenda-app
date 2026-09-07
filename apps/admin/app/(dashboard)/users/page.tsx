'use client'

/**
 * User management list (#92) — search (name or any linked wallet
 * address), status/role filters; rows open the detail page.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AppHeader } from '@/components/layout/header'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ListPagination } from '@/components/common/list-pagination'
import { UserStatusBadge } from '@/components/common/status-badge'
import { adminApi, type AdminUserListRow, type UserListQuery } from '@/api/client'
import { ApiError } from '@/lib/api'
import { formatAdminDate } from '@/lib/date-format'

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 400

export default function UsersPage() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState('')
  const [role, setRole] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<AdminUserListRow[]>([])
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [search])

  // setState lives in the .then callbacks (react-hooks/set-state-in-effect).
  useEffect(() => {
    let alive = true
    const query: UserListQuery = { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }
    if (debounced.trim() !== '') query.search = debounced.trim()
    if (status === 'active' || status === 'suspended') query.status = status
    if (role === 'user' || role === 'dispute_admin' || role === 'super_admin') query.role = role
    adminApi.adminUsers
      .list(query)
      .then((res) => {
        if (!alive) return
        setRows(res.data)
        setTotal(res.total)
      })
      .catch((err: unknown) => {
        if (alive) toast.error(err instanceof ApiError ? err.message : 'Failed to load users')
      })
    return () => {
      alive = false
    }
  }, [debounced, status, role, page])

  return (
    <>
      <AppHeader title="Users" />
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap gap-2">
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search name or wallet address…"
            className="w-72"
          />
          <NativeSelect value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="w-36">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </NativeSelect>
          <NativeSelect value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }} className="w-40">
            <option value="">Any role</option>
            <option value="user">user</option>
            <option value="dispute_admin">dispute_admin</option>
            <option value="super_admin">super_admin</option>
          </NativeSelect>
        </div>

        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No users match.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <Link href={`/users/${u.id}`} className="font-medium hover:underline">
                      {u.first_name} {u.last_name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.role === 'user' ? 'outline' : 'default'}>{u.role}</Badge>
                  </TableCell>
                  <TableCell><UserStatusBadge status={u.status} /></TableCell>
                  <TableCell>{u.city !== null ? `${u.city}, ${u.country}` : (u.country ?? '—')}</TableCell>
                  <TableCell>{u.review_score ?? '—'}</TableCell>
                  <TableCell>{formatAdminDate(u.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <ListPagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} onPageChange={setPage} />
      </div>
    </>
  )
}
