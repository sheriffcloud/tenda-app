'use client'

/**
 * Switch primitive — web's stand-in for React Native's built-in Switch
 * (mobile composes that directly; web needs its own). By default it is the
 * accessible control: a labelled `role="switch"` button. Composites whose
 * CARD is the switch (RemoteToggle) render it `presentational`, which
 * swaps the button for an inert span so the DOM never nests two controls.
 */
import { cn } from '@/lib/cn'

function Knob({ value }: { value: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute top-[2px] h-[22px] w-[22px] rounded-full bg-white transition-all',
        value ? 'left-5' : 'left-[2px]',
      )}
    />
  )
}

const trackClassName = (value: boolean, disabled: boolean) =>
  cn(
    'relative h-[26px] w-11 shrink-0 rounded-full transition-colors',
    value ? 'bg-brand-primary' : 'bg-border-strong',
    disabled && 'opacity-50',
  )

export function Toggle({
  value,
  onChange,
  label,
  disabled = false,
  presentational = false,
}: {
  value: boolean
  onChange?: (value: boolean) => void
  /** Accessible name; required because the control renders no text. */
  label: string
  disabled?: boolean
  /** Render as an inert visual inside a parent that IS the switch. */
  presentational?: boolean
}) {
  if (presentational) {
    return (
      <span aria-hidden className={trackClassName(value, disabled)}>
        <Knob value={value} />
      </span>
    )
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!value)}
      className={trackClassName(value, disabled)}
    >
      <Knob value={value} />
    </button>
  )
}
