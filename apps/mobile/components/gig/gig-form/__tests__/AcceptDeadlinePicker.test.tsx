/**
 * AcceptDeadlinePicker — the gig wrapper over the shared DurationChips. Verifies
 * it passes the gig copy and hour-valued options, and forwards the chosen hours
 * (the refactor must preserve the hours unit, not leak seconds).
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import { ACCEPT_DEADLINE_OPTIONS } from '@tenda/shared'

interface Captured {
  label: string
  hint?: string
  options: { label: string; value: number }[]
  onChange: (v: number) => void
}
let captured: Captured | null = null

jest.mock('@/components/ui/DurationChips', () => {
  const { Pressable, Text } = require('react-native')
  return {
    DurationChips: (props: Captured) => {
      captured = props
      return (
        <>
          <Text>{props.label}</Text>
          {props.options.map((o) => (
            <Pressable key={o.value} accessibilityRole="button" onPress={() => props.onChange(o.value)}>
              <Text>{o.label}</Text>
            </Pressable>
          ))}
        </>
      )
    },
  }
})

import { AcceptDeadlinePicker } from '../AcceptDeadlinePicker'

beforeEach(() => { captured = null })

test('passes the gig label + hint and hour-valued options', () => {
  render(<AcceptDeadlinePicker value={24} onChange={jest.fn()} />)
  expect(screen.getByText('Accept deadline')).toBeTruthy()
  expect(captured?.hint).toMatch(/workers to accept/i)
  expect(captured?.options).toEqual(ACCEPT_DEADLINE_OPTIONS.map((o) => ({ label: o.label, value: o.hours })))
})

test('forwards the chosen value in HOURS', () => {
  const onChange = jest.fn()
  render(<AcceptDeadlinePicker value={24} onChange={onChange} />)
  fireEvent.press(screen.getByText('48h'))
  expect(onChange).toHaveBeenCalledWith(48) // hours, not seconds
})
