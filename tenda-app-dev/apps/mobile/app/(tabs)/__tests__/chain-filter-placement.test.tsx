/**
 * The chain chip row must live OUTSIDE the pager on both tabbed screens.
 *
 * Nested inside it — as a list header on each page — the row is a horizontal
 * ScrollView inside a horizontal `pagingEnabled` ScrollView, so the pager
 * claimed every pan: trying to scroll the chips switched tabs instead. Nothing
 * about that failure is visible in a unit test of either component on its own,
 * which is why this pins the STRUCTURE: one row per screen, none of it under
 * the pager. It also guards the duplication that nesting implied — `chainId` is
 * shared by both tabs, so two instances of the control were always one too many.
 *
 * Both screens are mocked down to their shells; the mocks are shared (not
 * per-describe) because every describe body evaluates before the first test
 * runs, so two factories for one module would just overwrite each other.
 */
import { render } from '@testing-library/react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        content: { primary: '#000', secondary: '#666', tertiary: '#999' },
        surface: { background: '#fff', backgroundAlt: '#eee', inset: '#eee' },
        border: { subtle: '#ddd', default: '#ccc' },
        brand: { primary: '#50f' },
        feedback: { danger: { text: '#f00' } },
      },
    },
  }),
}))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/components/navigation', () => ({ PagerTabBar: () => null }))
jest.mock('@/components/filters', () => {
  const { View } = require('react-native')
  return { ChainFilterChips: () => <View testID="chain-filter" /> }
})
jest.mock('@/components/gig', () => ({
  GigCardCompact: () => null,
  GigListSkeleton: () => null,
  DraftsBanner: () => null,
}))
jest.mock('@/components/gig/gig-applications', () => ({
  MyApplicationCard: () => null,
  useApplications: () => ({ busy: false, apply: jest.fn(), withdraw: jest.fn(), release: jest.fn() }),
  MY_APPLICATIONS_EMPTY: { title: 'No applications', description: '' },
  WITHDRAW_CONFIRM: { title: '', message: '', confirmLabel: '', destructive: true },
}))
jest.mock('@/components/exchange', () => ({
  ExchangeMarketPage: () => null,
  ExchangeMyOffersPage: () => null,
  CurrencyFilterSheet: () => null,
}))
jest.mock('@/components/ui', () => {
  const { View } = require('react-native')
  return {
    ScreenContainer: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Header: () => null,
    EmptyState: () => null,
    ConfirmDialog: () => null,
    // Real, so the pages are genuine FlatLists — a header rendered through one
    // is exactly what this test has to be able to see.
    PaginatedList: jest.requireActual('@/components/ui/PaginatedList').PaginatedList,
  }
})
jest.mock('@/stores', () => ({ useAuthStore: () => ({ id: 'me' }) }))
jest.mock('@/hooks/useMyGigs', () => {
  const { listState } = require('@/hooks/__fixtures__/paginated-list')
  return {
    useMyGigs: () => ({
      posted: listState(),
      working: listState(),
      drafts: listState(),
      // The 4th tab (approval-mode applications) is caller-scoped and takes no
      // chain parameter, so the filter deliberately does not reach it — but the
      // pager still renders it and reads its count chip.
      applications: listState(),
      chainId: null,
      setChainId: jest.fn(),
    }),
  }
})
jest.mock('@/hooks/useExchangeScreen', () => {
  const { listState } = require('@/hooks/__fixtures__/paginated-list')
  return {
    useExchangeScreen: () => ({
      market: listState(),
      myTrades: listState(),
      currency: null,
      chainId: null,
      setCurrency: jest.fn(),
      setChainId: jest.fn(),
    }),
  }
})

import MyGigsScreen from '@/app/(tabs)/my-gigs'
import ExchangeScreen from '@/app/(tabs)/exchange'

/**
 * Every node carrying the pager's props. One `ScrollView` yields several (the
 * composite element and the host view beneath it both carry `pagingEnabled`),
 * which is why the test asserts over ALL of them rather than counting them.
 */
// Derived from RTL rather than imported from react-test-renderer, which ships
// no types in this workspace.
type TestNode = ReturnType<typeof render>['UNSAFE_root']

const pagerNodesIn = (root: TestNode) =>
  root.findAll((node: TestNode) => node.props?.pagingEnabled === true)

test.each([
  ['My Gigs', MyGigsScreen],
  ['Trade', ExchangeScreen],
])('%s renders one chain filter, and not inside the pager', (_name, Screen) => {
  const { UNSAFE_root, getAllByTestId } = render(<Screen />)

  // One control for the whole screen, not one per tab.
  expect(getAllByTestId('chain-filter')).toHaveLength(1)

  const pagerNodes = pagerNodesIn(UNSAFE_root)
  // Guard the guard: if the screen stopped using a paging ScrollView, the
  // assertion below would pass vacuously.
  expect(pagerNodes.length).toBeGreaterThan(0)
  // The assertion that matters: nothing chain-filter-shaped under the pager.
  for (const node of pagerNodes) {
    expect(node.findAllByProps({ testID: 'chain-filter' })).toHaveLength(0)
  }
})
