/**
 * SegmentedTabs — controlled pill switch. Verifies both tabs render, the active
 * tab is flagged for a11y, and tapping an inactive tab reports its key (tapping
 * the active tab still reports, the caller de-dupes).
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: { surface: { inset: '#eee', card: '#fff' }, brand: { primary: '#00f' }, content: { tertiary: '#999' } } },
  }),
}))
jest.mock('../Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

import { SegmentedTabs, segmentItemStyle } from '../SegmentedTabs'

const TABS = [
  { key: 'instant', label: 'Instant' },
  { key: 'offer', label: 'Create offer' },
] as const

test('renders every tab label', () => {
  render(<SegmentedTabs tabs={TABS} value="instant" onChange={jest.fn()} />)
  expect(screen.getByText('Instant')).toBeTruthy()
  expect(screen.getByText('Create offer')).toBeTruthy()
})

test('flags the active tab for a11y', () => {
  render(<SegmentedTabs tabs={TABS} value="offer" onChange={jest.fn()} />)
  expect(screen.getByRole('tab', { name: 'Instant' }).props.accessibilityState.selected).toBe(false)
  expect(screen.getByRole('tab', { name: 'Create offer' }).props.accessibilityState.selected).toBe(true)
})

test('reports the tapped tab key', () => {
  const onChange = jest.fn()
  render(<SegmentedTabs tabs={TABS} value="instant" onChange={onChange} />)
  fireEvent.press(screen.getByText('Create offer'))
  expect(onChange).toHaveBeenCalledWith('offer')
})

describe('segmentItemStyle', () => {
  test('selected tab gets the card background and never dims', () => {
    const flat = StyleSheet.flatten(segmentItemStyle(true, true, '#fff'))
    expect(flat.backgroundColor).toBe('#fff')
    expect(flat.opacity).toBeUndefined()
  })

  test('inactive + pressed dims (0.7) with no background', () => {
    const flat = StyleSheet.flatten(segmentItemStyle(false, true, '#fff'))
    expect(flat.opacity).toBe(0.7)
    expect(flat.backgroundColor).toBeUndefined()
  })

  test('inactive + idle applies neither', () => {
    const flat = StyleSheet.flatten(segmentItemStyle(false, false, '#fff'))
    expect(flat.opacity).toBeUndefined()
    expect(flat.backgroundColor).toBeUndefined()
  })
})
