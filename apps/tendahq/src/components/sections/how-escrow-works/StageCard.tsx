import { Pill } from '@/components/ui/Pill'
import type { EventRow as EventRowData, Stage, StageAccent } from './content'
import { cn } from '@/lib/cn'

interface Props {
  stage: Stage
}

interface AccentTokens {
  ring: string
  text: string
  numBg: string
  numColor: string
}

const ACCENTS: Record<StageAccent, AccentTokens> = {
  brand: {
    ring: 'color-mix(in oklab, var(--brand) 16%, transparent)',
    text: 'var(--brand)',
    numBg: 'transparent',
    numColor: 'var(--brand)',
  },
  accent: {
    ring: 'color-mix(in oklab, var(--accent) 16%, transparent)',
    text: 'var(--accent)',
    numBg: 'transparent',
    numColor: 'var(--accent)',
  },
  success: {
    ring: 'color-mix(in oklab, var(--success) 16%, transparent)',
    text: 'var(--success)',
    numBg: 'transparent',
    numColor: 'var(--success)',
  },
  content: {
    ring: 'transparent',
    text: 'var(--content-secondary)',
    numBg: 'var(--content-primary)',
    numColor: 'var(--surface-bg)',
  },
}

const STATUS_TONE: Record<NonNullable<EventRowData['statusTone']>, 'brand' | 'accent' | 'warning' | 'success' | 'neutral'> = {
  locked:        'brand',
  'in-progress': 'warning',
  released:      'success',
  final:         'neutral',
}

export function StageCard({ stage }: Props) {
  const accent = ACCENTS[stage.accent]
  return (
    <div className="flex flex-col">
      <header className="mb-5 flex items-center gap-3.5">
        <span
          className="mono inline-flex h-10 w-10 items-center justify-center rounded-full border-2 text-[15px] font-bold"
          style={{
            color: accent.numColor,
            borderColor: accent.numColor,
            background: accent.numBg,
            boxShadow: `0 0 0 4px ${accent.ring}`,
          }}
        >
          {stage.num}
        </span>
        <div className="min-w-0">
          <p
            className="caption uppercase tracking-[0.16em]"
            style={{ color: accent.text }}
          >
            {stage.tag}
          </p>
          <h3 className="h3 mt-1 text-[var(--content-primary)]">{stage.name}</h3>
        </div>
      </header>

      <p className="body text-[var(--content-secondary)]">{stage.body}</p>

      <div
        className={cn(
          'mt-5 flex flex-col gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3.5',
        )}
        style={{ boxShadow: `inset 3px 0 0 ${accent.numColor}` }}
      >
        {stage.event.rows.map((row) => (
          <EventRow key={row.label} row={row} />
        ))}
      </div>
    </div>
  )
}

function EventRow({ row }: { row: EventRowData }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="mono-sm uppercase tracking-[0.16em] text-[var(--content-tertiary)]">
        {row.label}
      </span>
      {row.kind === 'status' && row.statusTone ? (
        <Pill tone={STATUS_TONE[row.statusTone]} size="sm" dot>
          {row.value}
        </Pill>
      ) : row.kind === 'amt' ? (
        <span className="mono font-semibold text-[var(--content-primary)]">{row.value}</span>
      ) : row.kind === 'hash' ? (
        <span className="mono-sm text-[var(--content-tertiary)]">{row.value}</span>
      ) : (
        <span className="mono-sm text-[var(--content-secondary)]">{row.value}</span>
      )}
    </div>
  )
}
