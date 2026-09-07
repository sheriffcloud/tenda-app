import { useHealth, formatUptime } from '@/hooks/useHealth'
import { LiveDot } from '@/components/ui/LiveDot'
import { APP_INFO } from '@/content'

/**
 * Operational status row. Polls /v1/health on mount and renders three cells:
 *
 *   ● STATUS         (Operational / Unavailable based on /v1/health response)
 *   UPTIME           (formatted from `uptime` seconds)
 *   NETWORKS         (Solana · Base · Celo · version, from APP_INFO)
 *
 * Real data, no placeholders. If the API is unreachable the status flips to
 * "Unavailable" with a danger-tinted dot — the user can see at a glance
 * whether the public surface is live.
 */
export function FooterStatus() {
  const { data, loading, error } = useHealth()
  const isOperational = !!data && data.status === 'ok'

  return (
    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 sm:grid-cols-3 sm:divide-x sm:divide-[var(--border-subtle)] sm:p-0">
      <Cell label="Status">
        {loading ? (
          <span className="mono-sm text-[var(--content-tertiary)]">Checking…</span>
        ) : isOperational ? (
          <span className="mono-sm inline-flex items-center gap-2 font-semibold text-[var(--success)]">
            <LiveDot size={6} pulseMs={2000} />
            Operational
          </span>
        ) : (
          <span className="mono-sm inline-flex items-center gap-2 font-semibold text-[var(--danger)]">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--danger)' }}
            />
            {error ? 'Unavailable' : 'Degraded'}
          </span>
        )}
      </Cell>

      <Cell label="Uptime">
        <span className="mono-sm font-semibold text-[var(--content-primary)]">
          {data ? formatUptime(data.uptime) : '—'}
        </span>
      </Cell>

      <Cell label="Networks">
        <span className="mono-sm font-semibold text-[var(--content-primary)]">
          {APP_INFO.chains.networksLine} · {APP_INFO.version}
        </span>
      </Cell>
    </div>
  )
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:py-4">
      <span className="caption uppercase tracking-[0.16em] text-[var(--content-tertiary)]">
        {label}
      </span>
      {children}
    </div>
  )
}
