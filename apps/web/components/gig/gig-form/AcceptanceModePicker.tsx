'use client'

/**
 * How the gig gets a worker: first-come, or the poster approves — web twin
 * of mobile's gig-form/AcceptanceModePicker. Framed as a trade-off rather
 * than a setting, because it is one — both consequences are stated so the
 * pricier option is not chosen by accident.
 */
import { cn } from '@/lib/cn'

const ACCEPTANCE_OPTIONS: readonly { value: boolean; title: string; body: string }[] = [
  {
    value: false,
    title: 'First come, first served',
    body: 'The first worker to accept gets the gig and starts straight away.',
  },
  {
    value: true,
    title: 'I approve the worker',
    body: 'Workers apply, you pick one. Costs you one extra transaction, and the gig only starts when you choose.',
  },
]

export function AcceptanceModePicker({
  requiresApproval,
  onChange,
}: {
  requiresApproval: boolean
  onChange: (requiresApproval: boolean) => void
}) {
  return (
    <div role="radiogroup" aria-label="Who can take this gig" className="flex flex-col gap-2">
      {ACCEPTANCE_OPTIONS.map((option) => {
        const selected = option.value === requiresApproval
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-card border bg-surface-card p-4 text-left',
              selected ? 'border-2 border-brand-primary' : 'border-border-default',
            )}
          >
            <span className="block text-sm font-semibold text-content-primary">{option.title}</span>
            <span className="block text-xs text-content-secondary">{option.body}</span>
          </button>
        )
      })}
    </div>
  )
}
