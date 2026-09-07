'use client'

/**
 * The intent's status banner (Tier-3 comp, lines 784-799): what phase it is
 * in, what that means, and — while it is still waiting on the reader — how
 * long they have.
 *
 * The phase string is shared's `INTENT_STATUS_COPY`, not a local table: the
 * same seven statuses are named on mobile, and two spellings of "Waiting for
 * the provider" is exactly the drift this app keeps closing.
 */
import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import {
  INTENT_STATUS_COPY,
  formatFiat,
  formatHMS,
  instructionCopy,
  isTerminal,
  type FiatIntentDetail,
} from '@tenda/shared'
import { useCountdown } from '@/hooks/timing/useCountdown'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { cn } from '@/lib/cn'
import { INTENT_COPY, intentTone, type IntentTone } from './copy'

const TONE_CLASS: Record<IntentTone, string> = {
  pending: 'border-border-default bg-surface-inset text-content-primary',
  settled: 'border-feedback-success-border bg-feedback-success-surface text-feedback-success-text',
  failed: 'border-feedback-danger-border bg-feedback-danger-surface text-feedback-danger-text',
}

const TONE_ICON = { pending: Clock, settled: CheckCircle2, failed: XCircle }

export function IntentStatusPanel({ intent }: { intent: FiatIntentDetail }) {
  const tone = intentTone(intent.status)
  const Icon = TONE_ICON[tone]
  const terminal = isTerminal(intent.status)

  return (
    <div
      className={cn(
        'mt-6 animate-fadein [--motion-rise:6px] rounded-card border px-6 py-6',
        TONE_CLASS[tone],
      )}
    >
      {/* text-inherit: the panel's tone container owns the colour, so the
          eyebrow must not reassert its default tertiary. */}
      <Eyebrow className="flex items-center gap-2.5 font-bold text-inherit">
        <Icon size={18} aria-hidden className="shrink-0" />
        {INTENT_STATUS_COPY[intent.status]}
      </Eyebrow>

      <h2 className="mt-3.5 type-h1">
        {formatFiat(Number(intent.fiat_amount), intent.fiat_currency)}
      </h2>

      <p className="mt-2.5 max-w-[52ch] type-body opacity-90">
        {/* The provider's own instruction where there is one and it still
            applies — it is the only text that says what to actually DO. */}
        {intent.instruction !== null && !terminal
          ? instructionCopy(intent.instruction)
          : INTENT_COPY.body(tone)}
      </p>

      {!terminal && <ExpiryClock expiresAt={intent.expires_at} />}
    </div>
  )
}

/**
 * Its own component so the ticking hook is not mounted at all once the intent
 * is terminal — a settled transaction has no clock, and a hook called
 * conditionally would be a hook order bug.
 */
function ExpiryClock({ expiresAt }: { expiresAt: string }) {
  const remaining = useCountdown(expiresAt)
  if (remaining <= 0) return null
  return (
    <p className="mt-4 font-numeric text-[26px] font-bold leading-[30px]">
      <span className="sr-only">{INTENT_COPY.expiresIn}: </span>
      {formatHMS(remaining)}
    </p>
  )
}
