'use client'

/**
 * The two windows an offer carries, both from the SHARED option sets so the
 * chips can never offer a duration the server rejects.
 *
 * They are different questions and are kept apart: the accept window is how
 * long the offer sits on the book, the payment window is how long a buyer has
 * to pay once they take it. The second value threads to BOTH the escrow's
 * completion duration and the offer's payment window — one semantic, one
 * control.
 */
import { ACCEPT_DEADLINE_OPTIONS, EXCHANGE_PAYMENT_WINDOW_OPTIONS } from '@tenda/shared'
import { Chip } from '@/components/ui/Chip'

export const OFFER_DEADLINE_COPY = {
  accept: 'Offer stays open for',
  acceptNote: 'After this it expires and your crypto returns to your wallet.',
  window: 'Buyer must pay within',
  windowNote: 'Their clock starts when they accept, not now.',
} as const

function ChipRow({
  label,
  note,
  options,
  value,
  onChange,
}: {
  label: string
  note: string
  options: readonly { label: string; value: number }[]
  value: number
  onChange: (next: number) => void
}) {
  return (
    <div>
      <p className="type-body-small font-semibold text-content-secondary">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {options.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={option.value === value}
            onClick={() => onChange(option.value)}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs leading-4 text-content-tertiary">{note}</p>
    </div>
  )
}

const ACCEPT_OPTIONS = ACCEPT_DEADLINE_OPTIONS.map((o) => ({ label: o.label, value: o.hours }))
const WINDOW_OPTIONS = EXCHANGE_PAYMENT_WINDOW_OPTIONS.map((o) => ({ label: o.label, value: o.seconds }))

export function OfferDeadlines({
  acceptHours,
  onAcceptChange,
  paymentWindowSeconds,
  onPaymentWindowChange,
}: {
  acceptHours: number
  onAcceptChange: (hours: number) => void
  paymentWindowSeconds: number
  onPaymentWindowChange: (seconds: number) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <ChipRow
        label={OFFER_DEADLINE_COPY.accept}
        note={OFFER_DEADLINE_COPY.acceptNote}
        options={ACCEPT_OPTIONS}
        value={acceptHours}
        onChange={onAcceptChange}
      />
      <ChipRow
        label={OFFER_DEADLINE_COPY.window}
        note={OFFER_DEADLINE_COPY.windowNote}
        options={WINDOW_OPTIONS}
        value={paymentWindowSeconds}
        onChange={onPaymentWindowChange}
      />
    </div>
  )
}
