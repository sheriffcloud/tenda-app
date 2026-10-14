'use client'

/**
 * Live H:MM:SS countdown — web twin of mobile's shared DeadlineCountdown
 * over the SAME shared vocabulary: formatHMS for the clock and
 * countdownTone for the amber → red urgency shift as time runs out.
 *
 * The ticking itself is `useCountdown`, so the block variant on the exchange
 * offer page cannot drift from this one on either the digits or the
 * thresholds — only on layout, which is the whole difference between them.
 */
import { countdownTone, formatHMS, type CountdownTone } from '@tenda/shared'
import { useCountdown } from '@/hooks/timing/useCountdown'
import { cn } from '@/lib/cn'

/** Clock-digit colour per tone (mobile's toneFg, inline variant). */
const TONE_CLASS: Record<CountdownTone, string> = {
  normal: 'text-content-primary',
  warning: 'text-feedback-warning-base',
  danger: 'text-feedback-danger-base',
  expired: 'text-content-tertiary',
}

export function DeadlineCountdown({
  deadline,
  label,
  expiredLabel = 'Expired',
  className,
}: {
  deadline: Date | string
  label?: string
  expiredLabel?: string
  className?: string
}) {
  const remaining = useCountdown(deadline)

  const tone = countdownTone(remaining)
  if (tone === 'expired') {
    return <span className={cn('font-numeric', TONE_CLASS.expired, className)}>{expiredLabel}</span>
  }
  return (
    <span className={cn('font-numeric', className)}>
      {label !== undefined && <span className="text-content-tertiary">{label} </span>}
      <span className={cn('font-semibold', TONE_CLASS[tone])}>{formatHMS(remaining)}</span>
    </span>
  )
}
