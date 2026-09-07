'use client'

/** Platform metrics (#93) — user activity cards over GET /v1/admin/metrics. */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AppHeader } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { adminApi, type AdminMetrics } from '@/api/client'
import { ApiError } from '@/lib/api'

const CARDS: ReadonlyArray<{ key: keyof AdminMetrics; label: string }> = [
  { key: 'total_users', label: 'Total users' },
  { key: 'active_24h', label: 'Active 24h' },
  { key: 'active_7d', label: 'Active 7d' },
  { key: 'active_30d', label: 'Active 30d' },
  { key: 'suspended', label: 'Suspended' },
]

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)

  useEffect(() => {
    let alive = true
    adminApi.metrics
      .get()
      .then((res) => {
        if (alive) setMetrics(res.metrics)
      })
      .catch((err: unknown) => {
        if (alive) toast.error(err instanceof ApiError ? err.message : 'Failed to load metrics')
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <>
      <AppHeader title="Metrics" />
      <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5">
        {CARDS.map(({ key, label }) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{metrics === null ? '—' : metrics[key]}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}
