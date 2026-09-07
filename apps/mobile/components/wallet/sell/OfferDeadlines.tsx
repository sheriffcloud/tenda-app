import { ACCEPT_DEADLINE_OPTIONS, EXCHANGE_PAYMENT_WINDOW_OPTIONS } from '@tenda/shared'
import { DurationChips, type DurationOption } from '@/components/ui/DurationChips'

// Map the shared option sets to the picker's {label, value} shape once.
const ACCEPT_OPTIONS: readonly DurationOption[] = ACCEPT_DEADLINE_OPTIONS.map((o) => ({
  label: o.label,
  value: o.hours,
}))
const WINDOW_OPTIONS: readonly DurationOption[] = EXCHANGE_PAYMENT_WINDOW_OPTIONS.map((o) => ({
  label: o.label,
  value: o.seconds,
}))

/**
 * The offer-only deadline controls: how long the offer stays on the book
 * (accept window, hours) and how long the buyer has to pay once they accept
 * (payment window, seconds — the same value threads to both the escrow's
 * completion duration and the offer's payment window).
 */
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
    <>
      <DurationChips
        label="Accept deadline"
        hint="How long your offer stays open for a buyer to accept."
        options={ACCEPT_OPTIONS}
        value={acceptHours}
        onChange={onAcceptChange}
      />
      <DurationChips
        label="Payment window"
        hint="How long the buyer has to pay after accepting."
        options={WINDOW_OPTIONS}
        value={paymentWindowSeconds}
        onChange={onPaymentWindowChange}
      />
    </>
  )
}
