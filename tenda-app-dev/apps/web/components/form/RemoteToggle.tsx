'use client'

/**
 * Remote/on-site switch card — web twin of mobile's form/RemoteToggle (same
 * copy; the switch itself is the ui/Toggle primitive, as mobile's is RN's
 * built-in Switch). The whole card is the hit target, so the inner Toggle is
 * presentation-only here — the label lives on the card.
 */
import { Toggle } from '@/components/ui/Toggle'

export function RemoteToggle({
  value,
  onChange,
  title = 'Remote',
  hint,
}: {
  value: boolean
  onChange: (remote: boolean) => void
  title?: string
  hint?: string
}) {
  const defaultHint = value
    ? 'No physical location, visible globally.'
    : 'Worker comes to a specific location.'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={title}
      onClick={() => onChange(!value)}
      className="flex w-full items-center gap-3 rounded-card border border-border-default bg-surface-card px-4 py-3 text-left"
    >
      <span className="flex-1">
        <span className="block text-sm font-semibold text-content-primary">{title}</span>
        <span className="block text-xs text-content-tertiary">{hint ?? defaultHint}</span>
      </span>
      {/* The card is the accessible switch — the Toggle here is purely the
          visual (a nested interactive switch would be invalid DOM). */}
      <Toggle value={value} label={title} presentational />
    </button>
  )
}
