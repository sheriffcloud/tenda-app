/**
 * FeedHeader — the home feed's header: category chips, the chain chip row, and
 * the filter affordance. Pinned here because this header is what used to
 * UNMOUNT on every filter change (PaginatedList swapped the whole list for a
 * skeleton), and because its chips are single-select.
 *
 * Children that fetch or animate are mocked out; this is about chip semantics.
 */
import { render, screen, fireEvent } from '@testing-library/react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        content: { primary: '#000', secondary: '#666', tertiary: '#999' },
        surface: { inset: '#eee' },
        brand: { primary: '#50f' },
      },
    },
  }),
}))
jest.mock('@/components/gig/FeaturedRail', () => ({ FeaturedRail: () => null }))
jest.mock('@/components/notifications', () => ({ NotificationNudgeBanner: () => null }))
jest.mock('@/components/filters', () => ({ ChainFilterChips: () => null }))
jest.mock('@/components/feedback', () => ({ ServerStatus: () => null }))
jest.mock('@/components/ui', () => {
  const { Text, Pressable } = require('react-native')
  return {
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Chip: ({
      label,
      selected,
      onPress,
    }: {
      label: string
      selected?: boolean
      onPress: () => void
    }) => (
      <Pressable onPress={onPress}>
        <Text>{selected === true ? `${label} *` : label}</Text>
      </Pressable>
    ),
  }
})

import { FeedHeader } from '../FeedHeader'

const props = {
  railRefreshKey: 0,
  hasFilters: false,
  category: null,
  chainId: null,
  onOpenFilter: jest.fn(),
  onCategoryChange: jest.fn(),
  onChainChange: jest.fn(),
}

test('tapping an inactive category emits its key', () => {
  const onCategoryChange = jest.fn()
  render(<FeedHeader {...props} onCategoryChange={onCategoryChange} />)
  fireEvent.press(screen.getByText('Delivery'))
  expect(onCategoryChange).toHaveBeenCalledWith('delivery')
})

test('re-tapping the ACTIVE category is a no-op, not a reset', () => {
  // "All" is the clear affordance; a second tap on the selected chip silently
  // jumping back to every category is the behaviour this replaces.
  const onCategoryChange = jest.fn()
  render(
    <FeedHeader {...props} category="delivery" onCategoryChange={onCategoryChange} />,
  )
  fireEvent.press(screen.getByText('Delivery *'))
  expect(onCategoryChange).not.toHaveBeenCalledWith(null)
  expect(onCategoryChange).toHaveBeenCalledWith('delivery')
})

test('"All" clears the category filter', () => {
  const onCategoryChange = jest.fn()
  render(<FeedHeader {...props} category="photo" onCategoryChange={onCategoryChange} />)
  fireEvent.press(screen.getByText('All'))
  expect(onCategoryChange).toHaveBeenCalledWith(null)
})

test('the filter button opens the sheet', () => {
  const onOpenFilter = jest.fn()
  render(<FeedHeader {...props} onOpenFilter={onOpenFilter} />)
  fireEvent.press(screen.getByLabelText('Filter gigs'))
  expect(onOpenFilter).toHaveBeenCalled()
})
