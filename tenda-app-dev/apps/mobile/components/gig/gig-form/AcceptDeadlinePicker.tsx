import { DurationChips, type DurationOption } from '@/components/ui/DurationChips'
import { ACCEPT_DEADLINE_OPTIONS } from '@tenda/shared'

// The shared picker is unit-agnostic; gigs measure the accept window in hours.
const OPTIONS: readonly DurationOption[] = ACCEPT_DEADLINE_OPTIONS.map((o) => ({
  label: o.label,
  value: o.hours,
}))

/** How long the gig stays open for workers to accept (drives the refund window). */
export function AcceptDeadlinePicker({
  value,
  onChange,
}: {
  value: number
  onChange: (hours: number) => void
}) {
  return (
    <DurationChips
      label="Accept deadline"
      hint="How long the gig stays open for workers to accept."
      options={OPTIONS}
      value={value}
      onChange={onChange}
    />
  )
}
