/**
 * DurationPicker — the completion window.
 *
 * The bug this covers (#36): the custom field had no ceiling, so 91 days was
 * accepted in silence and only the wizard's footer objected — naming the
 * requirement but never the limit. The rule itself is shared and proved in
 * `gig-duration.test.ts`; what is proved HERE is that the field applies it and
 * says so, on this client as well as on web.
 */
import { render, screen, fireEvent } from '@testing-library/react-native'
import {
  DURATION_UNIT_SECONDS,
  MAX_COMPLETION_DURATION_SECONDS,
  MIN_COMPLETION_DURATION_SECONDS,
  durationRangeLabel,
} from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        brand: { primary: '#0a0', primarySurface: '#efe' },
        surface: { card: '#fff', inset: '#eee' },
        border: { default: '#ddd' },
        content: { primary: '#000', secondary: '#444', tertiary: '#999' },
        feedback: { danger: { text: '#900' } },
      },
    },
  }),
}))

import { DurationPicker } from '@/components/form/DurationPicker'

function setup(value = 0) {
  const onChange = jest.fn()
  const view = render(<DurationPicker value={value} onChange={onChange} />)
  return {
    onChange,
    rerender: (v: number) => view.rerender(<DurationPicker value={v} onChange={onChange} />),
  }
}

function openCustom() {
  fireEvent.press(screen.getByText('Custom'))
}

test('a preset emits its own seconds', () => {
  const { onChange } = setup()
  fireEvent.press(screen.getByText('7d'))
  expect(onChange).toHaveBeenLastCalledWith(7 * DURATION_UNIT_SECONDS.days)
})

test('the custom field states the window before anything is wrong', () => {
  setup()
  openCustom()
  expect(screen.getByText(`Anything from ${durationRangeLabel()}.`)).toBeTruthy()
})

test('an over-limit window is REFUSED by name, not clamped', () => {
  const { onChange, rerender } = setup()
  openCustom()
  fireEvent.changeText(screen.getByPlaceholderText('e.g. 10'), '91')

  expect(onChange).toHaveBeenLastCalledWith(91 * DURATION_UNIT_SECONDS.days)
  expect(onChange).not.toHaveBeenLastCalledWith(MAX_COMPLETION_DURATION_SECONDS)

  rerender(91 * DURATION_UNIT_SECONDS.days)
  expect(screen.getByText(`Delivery time must be ${durationRangeLabel()}`)).toBeTruthy()
})

test('exactly the maximum is accepted without complaint', () => {
  const { onChange, rerender } = setup()
  openCustom()
  fireEvent.changeText(screen.getByPlaceholderText('e.g. 10'), '90')

  expect(onChange).toHaveBeenLastCalledWith(MAX_COMPLETION_DURATION_SECONDS)
  rerender(MAX_COMPLETION_DURATION_SECONDS)
  expect(screen.queryByText(/Delivery time must be/)).toBeNull()
})

test('exactly the minimum is accepted — one hour, through the unit toggle', () => {
  const { onChange, rerender } = setup()
  openCustom()
  fireEvent.changeText(screen.getByPlaceholderText('e.g. 10'), '1')
  fireEvent.press(screen.getByLabelText('Toggle unit, currently days'))

  expect(onChange).toHaveBeenLastCalledWith(MIN_COMPLETION_DURATION_SECONDS)
  rerender(MIN_COMPLETION_DURATION_SECONDS)
  expect(screen.queryByText(/Delivery time must be/)).toBeNull()
})

test('junk in the field emits NOTHING rather than a wrong window', () => {
  // parseInt used to read '1e5' as 1 — a hundred-thousand-day entry silently
  // becoming a one-day window.
  const { onChange } = setup()
  openCustom()
  fireEvent.changeText(screen.getByPlaceholderText('e.g. 10'), '1e5')
  expect(onChange).not.toHaveBeenCalled()
})

test('an untouched custom field is not scolded', () => {
  setup()
  openCustom()
  expect(screen.queryByText(/Delivery time must be/)).toBeNull()
  expect(screen.queryByText(/Set a delivery time/)).toBeNull()
})

test('a resumed HOURS draft opens in hours, not "0 days"', () => {
  setup(6 * DURATION_UNIT_SECONDS.hours)
  expect(screen.getByDisplayValue('6')).toBeTruthy()
  expect(screen.getByLabelText('Toggle unit, currently hours')).toBeTruthy()
})

test('a resumed DAYS draft opens in days', () => {
  setup(4 * DURATION_UNIT_SECONDS.days)
  expect(screen.getByDisplayValue('4')).toBeTruthy()
  expect(screen.getByLabelText('Toggle unit, currently days')).toBeTruthy()
})
