/**
 * RestrictionBanner — the affected user's own view of an active restriction.
 *
 * Covered because the component was refactored onto the shared `NoticeBanner`
 * and had no test of its own to catch a regression in that move. The behaviour
 * that matters is the headline: a `manual_review` says "under review" with no
 * date, a timed one names the date, and a timed one whose `until` is missing or
 * unparseable must still say something rather than render "restricted until
 * Invalid Date".
 */
import { render, screen } from '@testing-library/react-native'
import type { MyRestriction, MyStandingResponse } from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        content: { secondary: '#555' },
        feedback: { warning: { base: '#C9780C', surface: '#FBEFD9' } },
      },
    },
  }),
}))

let mockStanding: MyStandingResponse | null = null
jest.mock('@/hooks/useStanding', () => ({
  useMyStanding: () => mockStanding,
}))

import { RestrictionBanner } from '../RestrictionBanner'

function standing(restriction: MyRestriction | null): MyStandingResponse {
  return { completion_rate: null, completed_count: 0, is_limited: restriction !== null, restriction }
}

beforeEach(() => {
  mockStanding = null
})

test('renders nothing in good standing', () => {
  mockStanding = standing(null)
  expect(render(<RestrictionBanner />).toJSON()).toBeNull()
})

test('renders nothing before the standing has loaded', () => {
  // `useMyStanding` returns null until the request lands; claiming good
  // standing OR a restriction before then would both be guesses.
  mockStanding = null
  expect(render(<RestrictionBanner />).toJSON()).toBeNull()
})

test('a manual review says so, with no date', () => {
  mockStanding = standing({ kind: 'manual_review', until: null, reason: 'Multiple reports' })
  render(<RestrictionBanner />)
  expect(screen.getByText('Your account is under review.')).toBeTruthy()
  expect(screen.getByText('Reason: Multiple reports')).toBeTruthy()
})

test('a timed restriction names the date it lifts', () => {
  mockStanding = standing({
    kind: 'create_cooldown',
    until: '2026-09-01T00:00:00.000Z',
    reason: 'Too many cancellations',
  })
  render(<RestrictionBanner />)
  // Formatted with the runtime locale, so match the parts rather than a
  // hardcoded rendering that would differ per CI machine.
  expect(screen.getByText(/Your account is restricted until .*2026\./)).toBeTruthy()
})

test.each([
  ['an unparseable date', 'not-a-date'],
  ['a missing date on a timed restriction', null],
])('%s still produces a usable headline', (_label, until) => {
  // The bug this guards: `new Date('not-a-date')` formats as "Invalid Date",
  // which would ship to the user as "restricted until Invalid Date".
  mockStanding = standing({ kind: 'create_cooldown', until, reason: 'Chargebacks' })
  render(<RestrictionBanner />)
  expect(screen.getByText('Your account is restricted.')).toBeTruthy()
  expect(screen.queryByText(/Invalid Date/)).toBeNull()
})
