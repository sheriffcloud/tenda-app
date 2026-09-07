/**
 * DurationChips — shared single-select duration picker. Verifies the label +
 * optional hint render, one chip per option, the selected chip is flagged, and
 * a tap reports the option's (unit-agnostic) value.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({ theme: { colors: { content: { tertiary: '#999' } } } }),
}))
jest.mock('../Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('../SectionLabel', () => {
  const { Text } = require('react-native')
  return { SectionLabel: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('../Chip', () => {
  const { Pressable, Text } = require('react-native')
  return {
    Chip: ({ label, onPress, selected }: { label: string; onPress?: () => void; selected?: boolean }) => (
      <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
  }
})

import { DurationChips } from '../DurationChips'

const OPTIONS = [
  { label: '1h', value: 3600 },
  { label: '12h', value: 43200 },
] as const

test('renders the label and hint', () => {
  render(<DurationChips label="Pay window" hint="How long to pay" options={OPTIONS} value={3600} onChange={jest.fn()} />)
  expect(screen.getByText('Pay window')).toBeTruthy()
  expect(screen.getByText('How long to pay')).toBeTruthy()
})

test('omits the hint when not provided', () => {
  render(<DurationChips label="Pay window" options={OPTIONS} value={3600} onChange={jest.fn()} />)
  expect(screen.queryByText('How long to pay')).toBeNull()
})

test('flags the selected option and reports the chosen value on press', () => {
  const onChange = jest.fn()
  render(<DurationChips label="Pay window" options={OPTIONS} value={3600} onChange={onChange} />)
  const chips = screen.UNSAFE_getAllByProps({ accessibilityRole: 'button' })
  expect(chips[0].props.accessibilityState).toEqual({ selected: true }) // 1h selected
  fireEvent.press(screen.getByText('12h'))
  expect(onChange).toHaveBeenCalledWith(43200)
})
