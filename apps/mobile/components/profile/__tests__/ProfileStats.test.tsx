/**
 * The profile's completed/posted/reputation row.
 *
 * What matters here is the difference between a number and a claim. This row
 * rendered `String(0)` unconditionally, so a load still in flight and a load
 * that had FAILED both told the reader the account had completed nothing and
 * posted nothing — about a brand-new account, in the least generous way
 * available, and about an offline one, wrongly.
 */
import { render, screen, fireEvent } from '@testing-library/react-native'

// The house pattern for a unistyles component under jest (see
// components/ui/__tests__/SegmentedTabs.test.tsx): stub the theme rather than
// boot the native module, and keep only the tokens this component reads.
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { card: '#fff', inset: '#f4f4f4' },
        border: { subtle: '#eee', default: '#ddd' },
        content: { primary: '#000', secondary: '#444', tertiary: '#999' },
        brand: { primary: '#00f', solid: '#00e', onPrimary: '#fff' },
        feedback: {
          danger: { surface: '#fee', border: '#fcc', text: '#900', solid: '#c00' },
          success: { solid: '#0a0' },
        },
      },
    },
  }),
}))

import { ProfileStats } from '@/components/profile/ProfileStats'

function setup(status: 'idle' | 'loading' | 'ready' | 'error', onRetry = jest.fn()) {
  render(
    <ProfileStats completed={4} posted={9} reputation="4.8" status={status} onRetry={onRetry} />,
  )
  return { onRetry }
}

test('ready: states the counts it was given', () => {
  setup('ready')
  expect(screen.getByText('4')).toBeTruthy()
  expect(screen.getByText('9')).toBeTruthy()
})

test('loading: an em-dash, not a zero — the counts are not known yet', () => {
  setup('loading')
  expect(screen.queryByText('4')).toBeNull()
  expect(screen.queryByText('9')).toBeNull()
  expect(screen.getAllByText('—')).toHaveLength(2)
})

test('error: says it could not load, and offers the retry', () => {
  const { onRetry } = setup('error')
  expect(screen.getByText(/couldn’t load your activity/i)).toBeTruthy()
  expect(screen.getAllByText('—')).toHaveLength(2)

  fireEvent.press(screen.getByText('Retry'))
  expect(onRetry).toHaveBeenCalledTimes(1)
})

test('ready with real zeroes still reads as an answer, not as a failure', () => {
  // The other half of the distinction: an account that genuinely has done
  // nothing shows 0, and must NOT show the error copy.
  render(<ProfileStats completed={0} posted={0} reputation="0.0" status="ready" onRetry={jest.fn()} />)
  expect(screen.getAllByText('0')).toHaveLength(2)
  expect(screen.queryByText(/couldn’t load/i)).toBeNull()
})

test('reputation is never blanked by a failed COUNT read', () => {
  // It comes off the user row, not off these counts. Blanking it would lose a
  // figure that was never in doubt.
  setup('error')
  // Regex, not an exact match: the Stat renders the value and its "/5" unit as
  // two nodes, so the reputation cell's text content is "4.8/5".
  expect(screen.getByText(/4\.8/)).toBeTruthy()
})

test('no retry affordance when there is nothing to retry', () => {
  setup('ready')
  expect(screen.queryByText('Retry')).toBeNull()
})
