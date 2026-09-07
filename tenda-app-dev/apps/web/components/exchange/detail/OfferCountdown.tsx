'use client'

/**
 * The offer page's countdown block (Tier-3 comp, lines 538-545), where the
 * comp's note is exactly right: "the phase change is the information". The
 * panel itself goes amber under two hours and red under thirty minutes, so
 * urgency is visible without reading the digits.
 *
 * Those thresholds are shared's `countdownTone`, and the digits are shared's
 * `formatHMS` — the same two the inline `DeadlineCountdown` uses. This is the
 * block variant of one clock, not a second clock.
 */
import { Timer } from 'lucide-react'
import { countdownTone, formatHMS, type CountdownTone } from '@tenda/shared'
import { useCountdown } from '@/hooks/timing/useCountdown'
import { cn } from '@/lib/cn'
import type { OfferClock } from './copy'

const TONE_CLASS: Record<CountdownTone, string> = {
  normal: 'border-border-subtle bg-surface-inset text-content-secondary',
  warning: 'border-feedback-warning-border bg-feedback-warning-surface text-feedback-warning-text',
  danger: 'border-feedback-danger-border bg-feedback-danger-surface text-feedback-danger-text',
  expired: 'border-feedback-danger-border bg-feedback-danger-surface text-feedback-danger-text',
}

export const OFFER_COUNTDOWN_COPY = {
  expiredValue: '0:00:00',
  expiredNote: 'This window has closed.',
} as const

export function OfferCountdown({ clock }: { clock: OfferClock }) {
  if (clock.deadline === null) {
    // No clock to run — a window that has not started yet. Neutral by
    // definition: nothing is running out.
    return (
      <CountdownFrame tone="normal" value={clock.staticValue ?? ''} label={clock.label} note={clock.note} />
    )
  }
  return <LiveCountdown clock={clock} deadline={clock.deadline} />
}

function LiveCountdown({ clock, deadline }: { clock: OfferClock; deadline: Date }) {
  const remaining = useCountdown(deadline)
  const tone = countdownTone(remaining)
  return (
    <CountdownFrame
      tone={tone}
      value={tone === 'expired' ? OFFER_COUNTDOWN_COPY.expiredValue : formatHMS(remaining)}
      label={clock.label}
      // An expired window's original advice ("miss this and it cancels") is
      // no longer advice — it already happened.
      note={tone === 'expired' ? OFFER_COUNTDOWN_COPY.expiredNote : clock.note}
    />
  )
}

function CountdownFrame({
  tone,
  value,
  label,
  note,
}: {
  tone: CountdownTone
  value: string
  label: string
  note: string
}) {
  return (
    <div
      data-offer-countdown
      className={cn(
        // The comps' `phase` entrance IS `fadein` with a 6px rise — globals.css
        // says to override the distance rather than add a near-identical
        // keyframe, so a phase change animates in without a second animation.
        'mt-6 flex animate-fadein [--motion-rise:6px] items-center gap-3.5 rounded-card border px-5 py-4.5',
        TONE_CLASS[tone],
      )}
    >
      <Timer size={20} aria-hidden className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="type-mono-mid font-bold">
          <span className="sr-only">{label}: </span>
          {value}
        </p>
        <p className="mt-0.5 type-body-small opacity-90">{note}</p>
      </div>
    </div>
  )
}
