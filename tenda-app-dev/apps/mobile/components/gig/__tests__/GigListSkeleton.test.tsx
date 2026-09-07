/**
 * GigListSkeleton — the feed's body placeholder. It replaced a full-screen
 * spinner, so the thing worth pinning is that it has INTRINSIC height per card
 * variant: a flex-filling child collapses inside a list content container, and
 * a mismatched height makes rows jump when they land.
 */
import { render, screen } from '@testing-library/react-native'

// Real Skeleton pulls in reanimated; the placeholder's geometry is what this
// asserts, so stand in a plain View that records the dimensions asked for.
jest.mock('@/components/ui', () => {
  const { View } = require('react-native')
  return {
    Skeleton: ({ height, width }: { height: number; width: string }) => (
      <View testID="skeleton-card" accessibilityLabel={`${width}:${height}`} />
    ),
  }
})

import { GigListSkeleton } from '../GigListSkeleton'

test('renders full-width placeholder cards at the rich card height', () => {
  render(<GigListSkeleton />)
  const cards = screen.getAllByTestId('skeleton-card')
  expect(cards).toHaveLength(4)
  expect(cards[0].props.accessibilityLabel).toBe('100%:150')
})

test('matches the priceLeading card height when the list renders that variant', () => {
  // My Gigs renders priceLeading rows (112pt) — the rich height would leave a
  // visible gap collapsing on arrival.
  render(<GigListSkeleton variant="priceLeading" count={3} />)
  const cards = screen.getAllByTestId('skeleton-card')
  expect(cards).toHaveLength(3)
  expect(cards[0].props.accessibilityLabel).toBe('100%:112')
})

test('honours an explicit count', () => {
  render(<GigListSkeleton count={1} />)
  expect(screen.getAllByTestId('skeleton-card')).toHaveLength(1)
})
