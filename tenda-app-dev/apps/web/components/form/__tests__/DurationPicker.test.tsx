/**
 * DurationPicker — the completion window.
 *
 * The bug this covers (#36): the custom field had no ceiling, so 91 days was
 * accepted in silence and only the wizard's footer objected, naming the
 * requirement but never the limit. The rule itself is shared and proved in
 * `gig-duration.test.ts`; what is proved HERE is that the field applies it and
 * says so.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import {
  DURATION_UNIT_SECONDS,
  MAX_COMPLETION_DURATION_SECONDS,
  MIN_COMPLETION_DURATION_SECONDS,
  durationRangeLabel,
} from '@tenda/shared'
import { DurationPicker } from '@/components/form/DurationPicker'

function setup(value = 0) {
  const onChange = vi.fn()
  const view = render(<DurationPicker value={value} onChange={onChange} />)
  return { onChange, rerender: (v: number) => view.rerender(<DurationPicker value={v} onChange={onChange} />) }
}

function openCustom() {
  fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
  return screen.getByLabelText('Custom duration in days') as HTMLInputElement
}

test('a preset emits its own seconds', () => {
  const { onChange } = setup()
  fireEvent.click(screen.getByRole('button', { name: '7d' }))
  expect(onChange).toHaveBeenLastCalledWith(7 * DURATION_UNIT_SECONDS.days)
})

test('the custom field states the window before anything is wrong', () => {
  setup()
  openCustom()
  expect(screen.getByText(`Anything from ${durationRangeLabel()}.`)).toBeInTheDocument()
})

test('an over-limit window is REFUSED by name, not clamped', () => {
  // 91 days: emitted exactly as typed — clamping would change the number after
  // the reader stopped looking at it — and called out, naming the limit.
  const { onChange, rerender } = setup()
  const input = openCustom()
  fireEvent.change(input, { target: { value: '91' } })

  expect(onChange).toHaveBeenLastCalledWith(91 * DURATION_UNIT_SECONDS.days)
  expect(onChange).not.toHaveBeenLastCalledWith(MAX_COMPLETION_DURATION_SECONDS)

  rerender(91 * DURATION_UNIT_SECONDS.days)
  expect(screen.getByRole('alert')).toHaveTextContent(`Delivery time must be ${durationRangeLabel()}`)
})

test('exactly the maximum is accepted without complaint', () => {
  const { onChange, rerender } = setup()
  const input = openCustom()
  fireEvent.change(input, { target: { value: '90' } })

  expect(onChange).toHaveBeenLastCalledWith(MAX_COMPLETION_DURATION_SECONDS)
  rerender(MAX_COMPLETION_DURATION_SECONDS)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('exactly the minimum is accepted — one hour, through the unit toggle', () => {
  const { onChange, rerender } = setup()
  const input = openCustom()
  fireEvent.change(input, { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: 'days' }))

  expect(onChange).toHaveBeenLastCalledWith(MIN_COMPLETION_DURATION_SECONDS)
  rerender(MIN_COMPLETION_DURATION_SECONDS)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('the unit toggle re-converts the number already typed', () => {
  const { onChange } = setup()
  const input = openCustom()
  fireEvent.change(input, { target: { value: '5' } })
  expect(onChange).toHaveBeenLastCalledWith(5 * DURATION_UNIT_SECONDS.days)

  fireEvent.click(screen.getByRole('button', { name: 'days' }))
  expect(onChange).toHaveBeenLastCalledWith(5 * DURATION_UNIT_SECONDS.hours)
})

test('junk in the field emits NOTHING rather than a wrong window', () => {
  // parseInt used to read '1e5' as 1 — a hundred-thousand-day entry silently
  // becoming a one-day window.
  const { onChange } = setup()
  const input = openCustom()
  fireEvent.change(input, { target: { value: '1e5' } })
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: '0' } })
  expect(onChange).not.toHaveBeenCalled()
})

test('an untouched custom field is not scolded', () => {
  // The value is still 0 here, which IS invalid — but the reader has not typed
  // anything yet, and objecting before they do is noise.
  setup()
  openCustom()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('a resumed HOURS draft opens in hours, not "0 days"', async () => {
  // The seed used to be `String(Math.round(value / 86_400))`, so a 6-hour
  // window came back as 0 — a number the reader never chose, in a unit they
  // never picked, on a draft they were resuming.
  setup(6 * DURATION_UNIT_SECONDS.hours)
  const input = screen.getByLabelText('Custom duration in hours') as HTMLInputElement
  expect(input.value).toBe('6')
})

test('a resumed DAYS draft opens in days', () => {
  setup(4 * DURATION_UNIT_SECONDS.days)
  const input = screen.getByLabelText('Custom duration in days') as HTMLInputElement
  expect(input.value).toBe('4')
})
