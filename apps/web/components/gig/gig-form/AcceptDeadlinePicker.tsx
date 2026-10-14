'use client'

/**
 * How long the gig stays open for workers to accept (drives the refund
 * window) — web twin of mobile's gig-form/AcceptDeadlinePicker.
 */
import { ACCEPT_DEADLINE_OPTIONS } from '@tenda/shared'
import { Chip } from '@/components/ui/Chip'

export function AcceptDeadlinePicker({
  value,
  onChange,
}: {
  value: number
  onChange: (hours: number) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-content-primary">Accept deadline</p>
      <p className="-mt-1 text-xs text-content-tertiary">
        How long the gig stays open for workers to accept.
      </p>
      <div className="flex flex-wrap gap-2">
        {ACCEPT_DEADLINE_OPTIONS.map((o) => (
          <Chip key={o.hours} label={o.label} selected={value === o.hours} onClick={() => onChange(o.hours)} />
        ))}
      </div>
    </div>
  )
}
