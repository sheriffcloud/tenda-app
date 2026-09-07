import { SectionShell } from '@/components/ui/SectionShell'
import { APP_INFO } from '@/content'
import { ESCROW_HEADER, STAGES } from './content'
import { StageCard } from './StageCard'
import { Fallback } from './Fallback'

/**
 * §04 How escrow works — single unified four-stage flow,
 * followed by a Fallback subsection covering the four exit routes.
 */
export function HowEscrowWorks() {
  return (
    <SectionShell id="how-it-works" surface="alt" padY="lg">
      <Header />

      <div className="mt-14 grid gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {STAGES.map((stage) => (
          <StageCard key={stage.num} stage={stage} />
        ))}
      </div>

      <Fallback />
    </SectionShell>
  )
}

function Header() {
  return (
    <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
      <div>
        <p className="eyebrow text-[var(--content-tertiary)]">
          <span className="mono font-semibold text-[var(--content-secondary)]">
            {ESCROW_HEADER.eyebrow.num}
          </span>
          <span className="mx-2 opacity-60">·</span>
          {ESCROW_HEADER.eyebrow.label}
        </p>
        <h2 className="h1 mt-4 text-[var(--content-primary)]">
          {ESCROW_HEADER.h2.line1}{' '}
          <span className="text-[var(--content-tertiary)]">{ESCROW_HEADER.h2.dim}</span>
          <br />
          <span className="text-[var(--accent)]">{ESCROW_HEADER.h2.accent}</span>
        </h2>
      </div>

      <div className="flex flex-col gap-6">
        <p className="body-lg text-[var(--content-secondary)]">{ESCROW_HEADER.sub}</p>
        <MetaRows />
      </div>
    </div>
  )
}

/**
 * Meta rows — single source of truth for values is `ESCROW_HEADER.meta` in
 * content.ts. Sentinel strings starting with `fromAppInfo:` are resolved here
 * against `APP_INFO.chains` so chain identity stays in one place.
 */
function MetaRows() {
  const resolve = (raw: string): string => {
    if (raw === 'fromAppInfo:networksLine') return APP_INFO.chains.networksLine
    if (raw === 'fromAppInfo:stage') return `${APP_INFO.version} · ${APP_INFO.chains.stage}`
    return raw
  }

  return (
    <div className="flex flex-col divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)]">
      {ESCROW_HEADER.meta.map((row) => (
        <div key={row.k} className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="caption uppercase tracking-[0.16em] text-[var(--content-tertiary)]">
            {row.k}
          </span>
          <span className="mono-sm text-[var(--content-primary)]">{resolve(row.v)}</span>
        </div>
      ))}
    </div>
  )
}
