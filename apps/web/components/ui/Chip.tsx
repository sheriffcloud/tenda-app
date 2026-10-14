'use client'

/**
 * Form chip — the web twin of mobile's form-variant Chip (picker rows:
 * network, durations, proof types). Distinct from the public FilterChip,
 * which stays local to the discovery filters on purpose.
 */
import { cn } from '@/lib/cn'

export function Chip({
  label,
  selected,
  disabled = false,
  onClick,
}: {
  label: string
  selected: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-control border px-3 py-2 text-sm font-medium transition-colors',
        selected
          ? 'border-brand-primary bg-brand-primary-surface text-brand-primary'
          : 'border-border-default bg-surface-card text-content-secondary hover:border-border-strong',
        disabled && 'cursor-not-allowed opacity-50 hover:border-border-default',
      )}
    >
      {label}
    </button>
  )
}
