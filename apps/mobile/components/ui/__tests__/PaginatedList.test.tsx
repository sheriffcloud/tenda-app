/**
 * PaginatedList — the shared FlatList wrapper. The states it arbitrates
 * (skeleton vs error vs empty vs rows) are the ones that were subtly
 * different on every hand-rolled list, so each branch is pinned here.
 */
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Text } from 'react-native'
import { listState } from '@/hooks/__fixtures__/paginated-list'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({ theme: { colors: { brand: { primary: '#50f' } } } }),
}))

import { PaginatedList } from '@/components/ui/PaginatedList'

interface Row { id: string }
const keyOf = (r: Row) => r.id
const renderItem = ({ item }: { item: Row }) => <Text>{item.id}</Text>
const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id }))

const Skeleton = () => <Text>SKELETON</Text>
const Empty = () => <Text>EMPTY</Text>
const Failed = () => <Text>ERROR</Text>

function renderList(list: ReturnType<typeof listState<Row>>, onRefresh?: () => void) {
  return render(
    <PaginatedList<Row>
      list={list}
      keyOf={keyOf}
      renderItem={renderItem}
      skeleton={<Skeleton />}
      empty={<Empty />}
      errorState={<Failed />}
      onRefresh={onRefresh}
      testID="list"
    />,
  )
}

test('renders rows', () => {
  renderList(listState({ items: rows('a', 'b') }))
  expect(screen.getByText('a')).toBeTruthy()
  expect(screen.getByText('b')).toBeTruthy()
})

test('shows the skeleton only while the FIRST page loads', () => {
  renderList(listState<Row>({ isLoading: true, hasFetched: false }))
  expect(screen.getByText('SKELETON')).toBeTruthy()
})

test('keeps rows visible while refreshing over existing content', () => {
  // A pull-to-refresh must not blank the list back to a skeleton.
  renderList(listState({ items: rows('a'), isRefreshing: true }))
  expect(screen.queryByText('SKELETON')).toBeNull()
  expect(screen.getByText('a')).toBeTruthy()
})

test('shows the error state when the first page failed with nothing loaded', () => {
  renderList(listState<Row>({ error: 'network down' }))
  expect(screen.getByText('ERROR')).toBeTruthy()
})

test('does NOT blank loaded rows when a later page errors', () => {
  renderList(listState({ items: rows('a'), error: 'page 2 died' }))
  expect(screen.queryByText('ERROR')).toBeNull()
  expect(screen.getByText('a')).toBeTruthy()
})

test('shows the empty state once a load has settled with no rows', () => {
  renderList(listState<Row>())
  expect(screen.getByText('EMPTY')).toBeTruthy()
})

test('does not claim empty before the first load settles', () => {
  // Otherwise a pending fetch reads as "you have nothing".
  renderList(listState<Row>({ hasFetched: false }))
  expect(screen.queryByText('EMPTY')).toBeNull()
})

test('does not claim empty while the first page is still loading', () => {
  render(
    <PaginatedList<Row>
      list={listState<Row>({ isLoading: true })}
      keyOf={keyOf}
      renderItem={renderItem}
      empty={<Empty />}
    />,
  )
  expect(screen.queryByText('EMPTY')).toBeNull()
})

test('fires loadMore when the end is reached', () => {
  const list = listState({ items: rows('a'), hasMore: true })
  renderList(list)
  fireEvent(screen.getByTestId('list'), 'onEndReached')
  expect(list.loadMore).toHaveBeenCalled()
})

test('fires the caller onRefresh, not the controller, on pull-to-refresh', () => {
  // The home feed also bumps the featured rail on refresh, so the screen owns
  // the handler rather than the list calling list.refresh() itself.
  const onRefresh = jest.fn()
  const list = listState({ items: rows('a') })
  renderList(list, onRefresh)
  fireEvent(screen.getByTestId('list'), 'refresh')
  expect(onRefresh).toHaveBeenCalled()
})

test('renders without a skeleton/error slot configured', () => {
  render(
    <PaginatedList<Row>
      list={listState({ items: rows('a'), isLoading: true, error: 'x' })}
      keyOf={keyOf}
      renderItem={renderItem}
    />,
  )
  expect(screen.getByText('a')).toBeTruthy()
})

test('renders separators between rows when a height is given', () => {
  const { UNSAFE_root } = render(
    <PaginatedList<Row>
      list={listState({ items: rows('a', 'b', 'c') })}
      keyOf={keyOf}
      renderItem={renderItem}
      separatorHeight={12}
    />,
  )
  // n rows → n-1 separators, each the requested height.
  const separators = UNSAFE_root
    .findAllByType(require('react-native').View)
    .filter((v: { props: { style?: { height?: number } } }) => v.props.style?.height === 12)
  expect(separators).toHaveLength(2)
})

describe('header retention (the chain-filter reload bug)', () => {
  const Header = () => <Text>CHIPS</Text>

  function renderWithHeader(list: ReturnType<typeof listState<Row>>) {
    return render(
      <PaginatedList<Row>
        list={list}
        keyOf={keyOf}
        renderItem={renderItem}
        header={<Header />}
        skeleton={<Skeleton />}
        empty={<Empty />}
        errorState={<Failed />}
      />,
    )
  }

  test('keeps the header mounted while the skeleton shows', () => {
    // The bug: PaginatedList returned the skeleton INSTEAD of the list, so the
    // header — the featured rail and the category/chain chip rows — unmounted
    // with it. Every chain-chip tap taken from an empty result blanked the
    // whole screen and reset the chip row's scroll offset.
    renderWithHeader(listState<Row>({ isLoading: true, hasFetched: false }))
    expect(screen.getByText('CHIPS')).toBeTruthy()
    expect(screen.getByText('SKELETON')).toBeTruthy()
  })

  test('keeps the header mounted while the error state shows', () => {
    renderWithHeader(listState<Row>({ error: 'network down' }))
    expect(screen.getByText('CHIPS')).toBeTruthy()
    expect(screen.getByText('ERROR')).toBeTruthy()
  })

  test('keeps the header mounted on an empty result', () => {
    renderWithHeader(listState<Row>())
    expect(screen.getByText('CHIPS')).toBeTruthy()
    expect(screen.getByText('EMPTY')).toBeTruthy()
  })

  test('swaps the ROWS for the skeleton on a filter change, header intact', () => {
    // isLoading with rows loaded means a page-0 load that changed the list's
    // identity: those rows belong to the filter the user just left, so showing
    // them under the newly-tapped chip is both a lie and (with no progress
    // signal) indistinguishable from a frozen screen.
    renderWithHeader(listState({ items: rows('stale'), isLoading: true }))
    expect(screen.getByText('CHIPS')).toBeTruthy()
    expect(screen.getByText('SKELETON')).toBeTruthy()
    expect(screen.queryByText('stale')).toBeNull()
  })

  test('keeps rows during a background reload — only a filter change swaps them', () => {
    // Polling calls reload(), which raises no flags at all.
    renderWithHeader(listState({ items: rows('a') }))
    expect(screen.getByText('a')).toBeTruthy()
    expect(screen.queryByText('SKELETON')).toBeNull()
  })

  test('a caller with no skeleton keeps its rows while page 0 reloads', () => {
    // Opt-in behaviour: blanking the body is only right when there is
    // something to put there.
    render(
      <PaginatedList<Row>
        list={listState({ items: rows('a'), isLoading: true })}
        keyOf={keyOf}
        renderItem={renderItem}
        header={<Header />}
      />,
    )
    expect(screen.getByText('a')).toBeTruthy()
  })

  test('does not show the empty state underneath the skeleton', () => {
    renderWithHeader(listState<Row>({ isLoading: true }))
    expect(screen.getByText('SKELETON')).toBeTruthy()
    expect(screen.queryByText('EMPTY')).toBeNull()
  })
})
