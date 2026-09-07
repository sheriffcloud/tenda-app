'use client'

/**
 * User detail (#92) — full profile + the #82 dispute-rate fraud FLAG
 * (signal only, never an automatic restriction) + the #92 action panel
 * (suspend/role/login-email).
 */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { AppHeader } from '@/components/layout/header'
import { Badge } from '@/components/ui/badge'
import { UserStatusBadge } from '@/components/common/status-badge'
import { UserActions } from '@/components/users/user-actions'
import { adminApi, type AdminUserDetail } from '@/api/client'
import { ApiError } from '@/lib/api'
import { formatAdminDate, formatAdminDateTime } from '@/lib/date-format'

function rate(bps: number | null): string {
  return bps === null ? 'no closed engagements' : `${(bps / 100).toFixed(1)}%`
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>()
  const [user, setUser] = useState<AdminUserDetail | null>(null)
  const [notFound, setNotFound] = useState(false)

  // setState lives in the .then callbacks (react-hooks/set-state-in-effect);
  // refreshKey bumps re-run the fetch after an action mutates the user.
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey((k) => k + 1)

  useEffect(() => {
    let alive = true
    adminApi.adminUsers
      .get(params.id)
      .then((detail) => {
        if (alive) setUser(detail)
      })
      .catch((err: unknown) => {
        if (!alive) return
        if (err instanceof ApiError && err.status === 404) setNotFound(true)
        else toast.error(err instanceof ApiError ? err.message : 'Failed to load user')
      })
    return () => {
      alive = false
    }
  }, [params.id, refreshKey])

  if (notFound) {
    return (
      <>
        <AppHeader title="User" />
        <p className="p-6 text-sm text-muted-foreground">
          User not found. <Link href="/users" className="underline">Back to users</Link>
        </p>
      </>
    )
  }
  if (user === null) {
    return (
      <>
        <AppHeader title="User" />
        <p className="p-6 text-sm text-muted-foreground">Loading…</p>
      </>
    )
  }

  const metric = user.dispute_metric
  return (
    <>
      <AppHeader title={`${user.first_name} ${user.last_name}`.trim() || 'User'} />
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-3 rounded-md border p-4">
          <UserStatusBadge status={user.status} />
          <Badge variant={user.role === 'user' ? 'outline' : 'default'}>{user.role}</Badge>
          {user.is_seeker && <Badge variant="secondary">seeker</Badge>}
          {metric.fraud_flag && (
            <Badge variant="destructive">⚑ fraud flag — review manually</Badge>
          )}
          <div className="ml-auto text-right text-xs text-muted-foreground">
            <p>Joined {formatAdminDate(user.created_at)}</p>
            <p>
              Last active{' '}
              {user.last_active_at === null ? 'never' : formatAdminDateTime(user.last_active_at)}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border p-4">
            <p className="mb-2 text-sm font-medium">Profile</p>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Location</dt><dd>{user.city !== null ? `${user.city}, ${user.country}` : (user.country ?? '—')}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Phone</dt><dd>{user.phone_e164 ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Review score</dt><dd>{user.review_score ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Advanced mode</dt><dd>{user.advanced_mode_enabled ? 'on' : 'off'}</dd></div>
            </dl>
          </div>

          <div className="rounded-md border p-4">
            <p className="mb-2 text-sm font-medium">Dispute metric (#82 — flag only)</p>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Closed engagements</dt><dd>{metric.closed_engagements}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Closed via dispute</dt><dd>{metric.disputed}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Dispute rate</dt><dd>{rate(metric.dispute_rate_bps)}</dd></div>
            </dl>
            {metric.fraud_flag ? (
              <p className="mt-2 text-xs text-destructive">
                Above 30% across ≥5 closed engagements. Investigate before acting — the flag
                never auto-restricts.
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Below the flag threshold.</p>
            )}
            {metric.disputed > 0 && (
              <Link
                href={`/disputes?party=${params.id}`}
                className="mt-3 inline-block text-xs underline underline-offset-2 hover:no-underline"
              >
                View this user&apos;s disputes →
              </Link>
            )}
          </div>
        </div>

        <UserActions user={user} onChanged={refresh} />
      </div>
    </>
  )
}
