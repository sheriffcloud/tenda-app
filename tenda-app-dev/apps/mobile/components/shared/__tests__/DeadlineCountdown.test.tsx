/**
 * DeadlineCountdown — the ticking H:MM:SS clock that turns amber → red as a
 * deadline runs out. Covers both variants, the expired state, the no-deadline
 * short-circuit, and the tone→colour mapping.
 */
import { render, screen } from '@testing-library/react-native'
import { StyleSheet, type TextStyle } from 'react-native'

const COLORS = {
  content: { primary: '#111', secondary: '#555', tertiary: '#999' },
  surface: { card: '#fff' },
  border: { default: '#ddd' },
  feedback: {
    warning: { base: '#WARN_B', surface: '#WARN_S', text: '#WARN_T', border: '#WARN_BD' },
    danger: { base: '#DANG_B', surface: '#DANG_S', text: '#DANG_T', border: '#DANG_BD' },
  },
}
jest.mock('react-native-unistyles', () => ({ useUnistyles: () => ({ theme: { colors: COLORS } }) }))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return {
    Text: ({ children, style }: { children: React.ReactNode; style?: unknown }) => (
      <Text style={style}>{children}</Text>
    ),
  }
})

import { DeadlineCountdown } from '../DeadlineCountdown'

const CLOCK = /^\d+:\d{2}:\d{2}$/
const inMs = (ms: number) => new Date(Date.now() + ms)
const colorOf = (node: { props: { style: TextStyle } }) => StyleSheet.flatten(node.props.style)?.color

beforeEach(() => { jest.useFakeTimers() })
afterEach(() => { jest.useRealTimers() })

test('null deadline renders nothing', () => {
  const { toJSON } = render(<DeadlineCountdown deadline={null} />)
  expect(toJSON()).toBeNull()
})

test('inline variant renders just the clock when no purpose label is supplied', () => {
  render(<DeadlineCountdown deadline={inMs(5 * 3_600_000)} size="inline" />)
  expect(screen.getByText(CLOCK)).toBeTruthy()
})

test('inline variant visibly names what the countdown controls', () => {
  render(<DeadlineCountdown deadline={inMs(5 * 3_600_000)} label="Time left to assign" />)
  expect(screen.getByText('Time left to assign')).toBeTruthy()
  expect(screen.getByText(CLOCK)).toBeTruthy()
  expect(screen.getByLabelText(/^Time left to assign \d+:\d{2}:\d{2}$/)).toBeTruthy()
})

test('prominent variant renders the label above the clock', () => {
  render(<DeadlineCountdown deadline={inMs(5 * 3_600_000)} label="Pay within" size="prominent" />)
  expect(screen.getByText('Pay within')).toBeTruthy()
  expect(screen.getByText(CLOCK)).toBeTruthy()
})

test('expired deadline renders the expired label, not a clock', () => {
  render(<DeadlineCountdown deadline={inMs(-1_000)} expiredLabel="Window closed" />)
  expect(screen.getByText('Window closed')).toBeTruthy()
  expect(screen.queryByText(CLOCK)).toBeNull()
})

test('tone: normal (>2h) uses the primary content colour', () => {
  render(<DeadlineCountdown deadline={inMs(5 * 3_600_000)} size="inline" />)
  expect(colorOf(screen.getByText(CLOCK))).toBe(COLORS.content.primary)
})

test('tone: warning (<2h) uses the amber base', () => {
  render(<DeadlineCountdown deadline={inMs(90 * 60_000)} size="inline" />)
  expect(colorOf(screen.getByText(CLOCK))).toBe(COLORS.feedback.warning.base)
})

test('tone: danger (<30m) uses the red base', () => {
  render(<DeadlineCountdown deadline={inMs(10 * 60_000)} size="inline" />)
  expect(colorOf(screen.getByText(CLOCK))).toBe(COLORS.feedback.danger.base)
})

test('prominent danger uses the darker readable text tone on the tinted banner', () => {
  render(<DeadlineCountdown deadline={inMs(10 * 60_000)} label="Pay within" size="prominent" />)
  expect(colorOf(screen.getByText(CLOCK))).toBe(COLORS.feedback.danger.text)
})
