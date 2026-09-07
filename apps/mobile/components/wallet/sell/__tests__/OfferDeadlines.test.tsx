/**
 * OfferDeadlines — the offer-only accept + payment window pickers. Verifies both
 * labels render, the accept options are in HOURS and the window options in
 * SECONDS (mapped from the shared constants), and each picker forwards its value.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import { ACCEPT_DEADLINE_OPTIONS, EXCHANGE_PAYMENT_WINDOW_OPTIONS } from '@tenda/shared'
import type { DurationOption } from '@/components/ui/DurationChips'

interface Capture { label: string; options: DurationOption[]; onChange: (v: number) => void }
const calls: Capture[] = []
jest.mock('@/components/ui/DurationChips', () => {
  const { Pressable, Text } = require('react-native')
  return {
    DurationChips: (p: Capture) => {
      calls.push(p)
      return (
        <Pressable accessibilityLabel={`change-${p.label}`} onPress={() => p.onChange(p.options[p.options.length - 1].value)}>
          <Text>{p.label}</Text>
        </Pressable>
      )
    },
  }
})

import { OfferDeadlines } from '../OfferDeadlines'

beforeEach(() => { calls.length = 0 })

test('renders accept (hours) and payment-window (seconds) pickers from the shared constants', () => {
  render(
    <OfferDeadlines acceptHours={24} onAcceptChange={jest.fn()} paymentWindowSeconds={43200} onPaymentWindowChange={jest.fn()} />,
  )
  expect(screen.getByText('Accept deadline')).toBeTruthy()
  expect(screen.getByText('Payment window')).toBeTruthy()

  const accept = calls.find((c) => c.label === 'Accept deadline')!
  const window = calls.find((c) => c.label === 'Payment window')!
  expect(accept.options).toEqual(ACCEPT_DEADLINE_OPTIONS.map((o) => ({ label: o.label, value: o.hours })))
  expect(window.options).toEqual(EXCHANGE_PAYMENT_WINDOW_OPTIONS.map((o) => ({ label: o.label, value: o.seconds })))
})

test('forwards the chosen accept (hours) and window (seconds) values', () => {
  const onAcceptChange = jest.fn()
  const onPaymentWindowChange = jest.fn()
  render(
    <OfferDeadlines acceptHours={24} onAcceptChange={onAcceptChange} paymentWindowSeconds={43200} onPaymentWindowChange={onPaymentWindowChange} />,
  )
  fireEvent.press(screen.getByLabelText('change-Accept deadline'))
  fireEvent.press(screen.getByLabelText('change-Payment window'))
  expect(onAcceptChange).toHaveBeenCalledWith(ACCEPT_DEADLINE_OPTIONS[ACCEPT_DEADLINE_OPTIONS.length - 1].hours)
  expect(onPaymentWindowChange).toHaveBeenCalledWith(
    EXCHANGE_PAYMENT_WINDOW_OPTIONS[EXCHANGE_PAYMENT_WINDOW_OPTIONS.length - 1].seconds,
  )
})
