/**
 * The Drafts screen — the surface that replaced the Drafts tab.
 *
 * Two things carry real risk here. It must own a chain filter of its own (the
 * banner count that leads here is deliberately unfiltered, so the narrowing has
 * to exist somewhere), and it must re-read on a LATER focus: funding or
 * deleting a draft happens on the gig detail screen pushed on top of this one,
 * so coming back to a stale list would show a row that no longer exists.
 */
import { render, screen, act } from '@testing-library/react-native'

const mockUseDraftGigs = jest.fn()
// Captured so a test can fire the focus callback the way expo-router would.
let focusCallback: (() => void) | null = null

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        content: { primary: '#000', secondary: '#666', tertiary: '#999' },
        surface: { background: '#fff', backgroundAlt: '#eee', inset: '#eee' },
        border: { subtle: '#ddd', default: '#ccc' },
        brand: { primary: '#50f' },
      },
    },
  }),
}))
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => {
    focusCallback = cb
  },
}))
jest.mock('lucide-react-native', () => ({ FileClock: () => null }))
jest.mock('@/components/filters', () => {
  const { View } = require('react-native')
  return {
    ChainFilterChips: ({ onChange }: { onChange: (c: string | null) => void }) => (
      <View testID="chain-filter" onTouchEnd={() => onChange('eip155:84532')} />
    ),
  }
})
jest.mock('@/components/gig', () => {
  const { View } = require('react-native')
  return {
    GigCardCompact: () => <View testID="gig-card" />,
    GigListSkeleton: () => <View testID="skeleton" />,
  }
})
jest.mock('@/components/ui', () => {
  const { View, Text } = require('react-native')
  return {
    ScreenContainer: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Header: ({ title }: { title: string }) => <Text>{title}</Text>,
    EmptyState: ({ title }: { title: string }) => <Text>{title}</Text>,
    PaginatedList: jest.requireActual('@/components/ui/PaginatedList').PaginatedList,
  }
})
jest.mock('@/hooks/useDraftGigs', () => ({
  useDraftGigs: (chainId: string | null) => mockUseDraftGigs(chainId),
}))

import { listState } from '@/hooks/__fixtures__/paginated-list'
import DraftsScreen from '@/app/my-gigs/drafts'

beforeEach(() => {
  focusCallback = null
  mockUseDraftGigs.mockReset()
  mockUseDraftGigs.mockReturnValue(listState())
})

test('renders draft rows', () => {
  mockUseDraftGigs.mockReturnValue(
    listState({ items: [{ escrow_id: 'd1' }, { escrow_id: 'd2' }] }),
  )
  render(<DraftsScreen />)
  expect(screen.getAllByTestId('gig-card')).toHaveLength(2)
})

test('shows the empty state once the load has settled', () => {
  mockUseDraftGigs.mockReturnValue(listState({ items: [], hasFetched: true }))
  render(<DraftsScreen />)
  expect(screen.getByText('No drafts')).toBeTruthy()
})

test('does NOT claim "no drafts" before the first load settles', () => {
  // The negative case: an unfetched list is a pending request, not an answer.
  mockUseDraftGigs.mockReturnValue(listState({ items: [], hasFetched: false, isLoading: true }))
  render(<DraftsScreen />)
  expect(screen.queryByText('No drafts')).toBeNull()
  expect(screen.getByTestId('skeleton')).toBeTruthy()
})

test('carries its own chain filter — the banner count that leads here has none', () => {
  render(<DraftsScreen />)
  expect(screen.getAllByTestId('chain-filter')).toHaveLength(1)
})

test('starts unfiltered, then passes the chosen chain to the query', () => {
  render(<DraftsScreen />)
  expect(mockUseDraftGigs).toHaveBeenLastCalledWith(null)

  act(() => {
    screen.getByTestId('chain-filter').props.onTouchEnd()
  })
  expect(mockUseDraftGigs).toHaveBeenLastCalledWith('eip155:84532')
})

test('re-reads on a later focus — a funded draft must not linger', () => {
  const list = listState({ items: [{ escrow_id: 'd1' }] })
  mockUseDraftGigs.mockReturnValue(list)
  render(<DraftsScreen />)

  act(() => focusCallback?.())
  expect(list.reload).toHaveBeenCalledTimes(1)
})

test('does not re-read on focus before the first load has landed', () => {
  // Page 0 is owned by the list controller; reloading here too would turn the
  // first load into two.
  const list = listState({ items: [], hasFetched: false })
  mockUseDraftGigs.mockReturnValue(list)
  render(<DraftsScreen />)

  act(() => focusCallback?.())
  expect(list.reload).not.toHaveBeenCalled()
})
