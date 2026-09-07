/**
 * ExchangeMyOffersPage — the "My Trades" list. Verifies the empty-state "Post
 * offer" action fires, that each row's side is derived from whether the
 * current user created the escrow (selling) or accepted it (buying), and that
 * the paginated list's loading/empty states are wired correctly.
 */
import { render, screen, fireEvent } from '@testing-library/react-native'
import type { EscrowListRow } from '@tenda/shared'
import { listState } from '@/hooks/__fixtures__/paginated-list'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({ theme: { colors: { brand: { primary: '#50f' } } } }),
}))
jest.mock('../OfferListSkeleton', () => ({ OfferListSkeleton: () => null }))
// Capture the side each row is asked to render with.
const rowSides: string[] = []
jest.mock('../MyOfferRow', () => {
  const { Text } = require('react-native')
  return {
    MyOfferRow: ({ offer, side }: { offer: { id: string }; side: string }) => {
      rowSides.push(`${offer.id}:${side}`)
      return <Text>{`${offer.id}:${side}`}</Text>
    },
  }
})
jest.mock('@/components/ui', () => {
  const { Text, Pressable } = require('react-native')
  return {
    EmptyState: ({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) => (
      <>
        <Text>{title}</Text>
        {action && (
          <Pressable onPress={action.onPress}>
            <Text>{action.label}</Text>
          </Pressable>
        )}
      </>
    ),
    PaginatedList: jest.requireActual('@/components/ui/PaginatedList').PaginatedList,
  }
})

import { ExchangeMyOffersPage } from '../ExchangeMyOffersPage'

const row = (id: string, creator_id: string): EscrowListRow => ({
  id, kind: 'exchange', status: 'open', chain_id: 'solana:devnet', asset: 'USDC_SOL',
  amount_raw: '1000000', title: null, fiat_currency: 'NGN', creator_id,
  counterparty_id: null, accept_deadline: null, created_at: '2026-08-15T12:00:00.000Z',
})

beforeEach(() => { rowSides.length = 0 })

test('empty state renders the Post offer action and fires it', () => {
  const onPostOffer = jest.fn()
  render(
    <ExchangeMyOffersPage
      width={375}
      list={listState<EscrowListRow>()}
      currentUserId="me"
      onPostOffer={onPostOffer}
    />,
  )
  expect(screen.getByText('No trades yet')).toBeTruthy()
  fireEvent.press(screen.getByText('Post offer'))
  expect(onPostOffer).toHaveBeenCalledTimes(1)
})

test('derives selling for offers I created, buying for offers I did not', () => {
  render(
    <ExchangeMyOffersPage
      width={375}
      list={listState({ items: [row('a', 'me'), row('b', 'other')] })}
      currentUserId="me"
      onPostOffer={jest.fn()}
    />,
  )
  expect(rowSides).toContain('a:selling')
  expect(rowSides).toContain('b:buying')
})

test('shows the skeleton instead of the list while the first page loads', () => {
  render(
    <ExchangeMyOffersPage
      width={375}
      list={listState<EscrowListRow>({ isLoading: true, hasFetched: false })}
      currentUserId="me"
      onPostOffer={jest.fn()}
    />,
  )
  expect(screen.queryByText('No trades yet')).toBeNull()
})

test('does not claim "no trades" before the first load settles', () => {
  render(
    <ExchangeMyOffersPage
      width={375}
      list={listState<EscrowListRow>({ hasFetched: false })}
      currentUserId="me"
      onPostOffer={jest.fn()}
    />,
  )
  expect(screen.queryByText('No trades yet')).toBeNull()
})
