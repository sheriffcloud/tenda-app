import { ChipGroup, type ChipOption } from './ChipGroup'

/** Unit is the caller's choice (hours for gigs, seconds for exchange). */
export type DurationOption = ChipOption<number>

/**
 * A labelled row of single-select duration chips. The one picker shared by the
 * gig accept-deadline and the exchange offer windows — the unit lives with the
 * caller's option set, so this stays purely presentational. Layout comes from
 * ChipGroup, which multi-select pickers share.
 */
export function DurationChips({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string
  hint?: string
  options: readonly DurationOption[]
  value: number
  onChange: (value: number) => void
}) {
  return (
    <ChipGroup
      label={label}
      {...(hint !== undefined ? { hint } : {})}
      options={options}
      isSelected={(v) => v === value}
      onPress={onChange}
    />
  )
}
