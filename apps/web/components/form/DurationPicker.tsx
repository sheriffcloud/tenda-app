'use client'

/**
 * Completion-window picker — web port of mobile's DurationPicker: preset
 * chips + a Custom chip revealing a numeric input with a day/hour unit
 * toggle.
 *
 * The presets and the seconds arithmetic are SHARED (`gig-duration`), not
 * written here: both clients had them inline and both had the same hole — a
 * custom window with no ceiling, so 91 days emitted a value the server
 * refuses while the field said nothing. The over-limit value is still emitted
 * exactly as typed; what changed is that the reader is told, here, what the
 * window is.
 */
import { useState } from 'react'
import {
  DURATION_PRESETS,
  DURATION_UNIT_SECONDS,
  completionDurationProblem,
  customDurationToSeconds,
  durationRangeLabel,
  type DurationUnit,
} from '@tenda/shared'
import { Chip } from '@/components/ui/Chip'
import { controlClassName } from '@/components/ui/TextField'

export function DurationPicker({
  label = 'Completion window',
  helper = 'How long the worker has after accepting.',
  value,
  onChange,
}: {
  label?: string
  helper?: string
  value: number
  onChange: (seconds: number) => void
}) {
  const isPreset = DURATION_PRESETS.some((p) => p.seconds === value)
  // Seed from the value only when there IS a custom value. `String(Math.round(
  // 0 / 86400))` is '0', so an unset field opened pre-filled with a zero it
  // then objected to; and a custom window measured in HOURS rounded to '0'
  // days, which is what a resumed 6-hour draft used to display.
  const isCustom = !isPreset && value > 0
  const initialUnit: DurationUnit =
    isCustom && value % DURATION_UNIT_SECONDS.days !== 0 ? 'hours' : 'days'
  const [unit, setUnit] = useState<DurationUnit>(initialUnit)
  const [customNum, setCustomNum] = useState(
    isCustom ? String(Math.round(value / DURATION_UNIT_SECONDS[initialUnit])) : '',
  )
  const [customMode, setCustomMode] = useState(isCustom)
  // Only while the reader is in the custom field: a preset cannot be wrong,
  // and an untouched field should not be scolded before it is filled in.
  const problem = customMode && customNum !== '' ? completionDurationProblem(value) : null

  function selectPreset(seconds: number) {
    setCustomMode(false)
    onChange(seconds)
  }

  function handleCustomChange(val: string) {
    setCustomNum(val)
    const seconds = customDurationToSeconds(val, unit)
    if (seconds !== null) onChange(seconds)
  }

  function toggleUnit() {
    const next: DurationUnit = unit === 'days' ? 'hours' : 'days'
    setUnit(next)
    const seconds = customDurationToSeconds(customNum, next)
    if (seconds !== null) onChange(seconds)
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-content-primary">{label}</p>
      <p className="-mt-1 text-xs text-content-tertiary">{helper}</p>
      <div className="flex flex-wrap gap-2">
        {DURATION_PRESETS.map((p) => (
          <Chip
            key={p.label}
            label={p.label}
            selected={!customMode && value === p.seconds}
            onClick={() => selectPreset(p.seconds)}
          />
        ))}
        <Chip label="Custom" selected={customMode} onClick={() => setCustomMode(true)} />
      </div>
      {customMode && (
        <div className="flex items-center gap-2">
          <input
            inputMode="numeric"
            value={customNum}
            aria-label={`Custom duration in ${unit}`}
            onChange={(e) => handleCustomChange(e.target.value)}
            className={`${controlClassName} max-w-28`}
          />
          <button
            type="button"
            onClick={toggleUnit}
            className="rounded-control border border-border-default px-3 py-2 text-sm text-content-secondary"
          >
            {unit}
          </button>
        </div>
      )}
      {customMode && (
        <p
          className={problem === null ? 'text-xs text-content-tertiary' : 'text-xs text-feedback-danger-text'}
          role={problem === null ? undefined : 'alert'}
        >
          {problem ?? `Anything from ${durationRangeLabel()}.`}
        </p>
      )}
    </div>
  )
}
