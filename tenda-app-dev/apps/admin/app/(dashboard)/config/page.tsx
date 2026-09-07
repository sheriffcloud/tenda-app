'use client'

/**
 * Platform config (#93) — the PATCHable subset; the rest of the row is shown
 * read-only. Server validates ranges and busts its cache.
 *
 * Input bounds come from the same shared constants the server validates
 * against, never literals: the fee inputs previously allowed up to 10000 bps
 * while the API caps at ESCROW_LIMITS.maxPlatformFeeBps (1000), so the form
 * accepted values the server then rejected.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  ESCROW_LIMITS,
  MAX_PENDING_GIGS_CEILING,
  MAX_OPEN_APPLICATIONS_CEILING,
  MIN_APPLICATION_TTL_SECONDS,
  MAX_APPLICATION_TTL_SECONDS,
} from '@tenda/shared'
import type { AdminPlatformConfig } from '@tenda/shared'
import { AppHeader } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'

/** Whole number or null — never coerces '' to 0. */
function parseIntStrict(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  return Number.isInteger(n) ? n : null
}

export default function ConfigPage() {
  const [config, setConfig] = useState<AdminPlatformConfig | null>(null)
  const [feeBps, setFeeBps] = useState('')
  const [seekerFeeBps, setSeekerFeeBps] = useState('')
  const [graceSeconds, setGraceSeconds] = useState('')
  const [maxPendingGigs, setMaxPendingGigs] = useState('')
  const [unassignWindow, setUnassignWindow] = useState('')
  const [maxApplications, setMaxApplications] = useState('')
  const [applicationTtl, setApplicationTtl] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    adminApi.platformConfig
      .get()
      .then((row) => {
        if (!alive) return
        setConfig(row)
        setFeeBps(String(row.fee_bps))
        setSeekerFeeBps(String(row.seeker_fee_bps))
        setGraceSeconds(String(row.grace_period_seconds))
        setMaxPendingGigs(String(row.max_pending_gigs))
        setUnassignWindow(String(row.unassign_window_seconds))
        setMaxApplications(String(row.max_open_applications))
        setApplicationTtl(String(row.application_ttl_seconds))
      })
      .catch((err: unknown) => {
        if (alive) toast.error(err instanceof ApiError ? err.message : 'Failed to load config')
      })
    return () => {
      alive = false
    }
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    // Number('') is 0 — a cleared field must BLOCK the save, not silently
    // zero the platform fee or the grace period.
    const fee_bps = parseIntStrict(feeBps)
    const seeker_fee_bps = parseIntStrict(seekerFeeBps)
    const grace_period_seconds = parseIntStrict(graceSeconds)
    const max_pending_gigs = parseIntStrict(maxPendingGigs)
    const unassign_window_seconds = parseIntStrict(unassignWindow)
    const max_open_applications = parseIntStrict(maxApplications)
    const application_ttl_seconds = parseIntStrict(applicationTtl)
    if (
      fee_bps === null ||
      seeker_fee_bps === null ||
      grace_period_seconds === null ||
      max_pending_gigs === null ||
      unassign_window_seconds === null ||
      max_open_applications === null ||
      application_ttl_seconds === null
    ) {
      toast.error('Every field needs a whole number')
      return
    }
    setBusy(true)
    try {
      const updated = await adminApi.platformConfig.update({
        fee_bps,
        seeker_fee_bps,
        grace_period_seconds,
        max_pending_gigs,
        unassign_window_seconds,
        max_open_applications,
        application_ttl_seconds,
      })
      setConfig(updated)
      toast.success('Config saved — server cache busted')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AppHeader title="Platform Config" />
      <div className="flex flex-col gap-4 p-4">
        {config === null ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <form onSubmit={save} className="grid max-w-2xl gap-4 rounded-md border p-4 md:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="fee">Platform fee (bps)</Label>
                <Input id="fee" type="number" min={0} max={ESCROW_LIMITS.maxPlatformFeeBps} value={feeBps} onChange={(e) => setFeeBps(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="seeker">Seeker fee (bps)</Label>
                <Input id="seeker" type="number" min={0} max={ESCROW_LIMITS.maxPlatformFeeBps} value={seekerFeeBps} onChange={(e) => setSeekerFeeBps(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="grace">Grace period (seconds)</Label>
                <Input id="grace" type="number" min={0} max={ESCROW_LIMITS.maxGracePeriodSeconds} value={graceSeconds} onChange={(e) => setGraceSeconds(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="maxgigs">Max concurrent gigs / worker</Label>
                <Input id="maxgigs" type="number" min={1} max={MAX_PENDING_GIGS_CEILING} value={maxPendingGigs} onChange={(e) => setMaxPendingGigs(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="unassign">Unassign window (seconds)</Label>
                <Input id="unassign" type="number" min={ESCROW_LIMITS.minUnassignWindowSeconds} max={ESCROW_LIMITS.maxUnassignWindowSeconds} value={unassignWindow} onChange={(e) => setUnassignWindow(e.target.value)} />
                <p className="text-xs text-muted-foreground">Applies to gigs posted from now on — it is fixed on-chain at create.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="maxapps">Max open applications / worker</Label>
                <Input id="maxapps" type="number" min={1} max={MAX_OPEN_APPLICATIONS_CEILING} value={maxApplications} onChange={(e) => setMaxApplications(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="appttl">Application lifetime (seconds)</Label>
                <Input id="appttl" type="number" min={MIN_APPLICATION_TTL_SECONDS} max={MAX_APPLICATION_TTL_SECONDS} value={applicationTtl} onChange={(e) => setApplicationTtl(e.target.value)} />
                <p className="text-xs text-muted-foreground">Applies to applications created from now on.</p>
              </div>
              <div className="md:col-span-3">
                <Button type="submit" disabled={busy}>Save</Button>
              </div>
            </form>

            <div className="max-w-2xl rounded-md border p-4 text-sm">
              <p className="mb-2 font-medium">Read-only</p>
              <dl className="space-y-1">
                <div className="flex justify-between"><dt className="text-muted-foreground">Approval window (s)</dt><dd>{config.approval_window_seconds}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Default sponsored txs</dt><dd>{config.default_sponsored_tx_count}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Moderation rules version</dt><dd>{config.moderation_rules_version}</dd></div>
              </dl>
            </div>
          </>
        )}
      </div>
    </>
  )
}
