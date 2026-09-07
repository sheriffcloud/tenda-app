/**
 * SellerPayoutCard — the seller's view of the account bound to their offer
 * (the gap: only the accepted buyer could ever see it). Pins the visibility
 * predicate (creator-only, live statuses, account present) and the render.
 */
import { render, screen } from '@testing-library/react-native'
import type { ExchangePayoutAccount, EscrowStatus, UserRef } from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: {
      surface: { card: '#fff' }, border: { default: '#ddd', subtle: '#eee' },
      content: { primary: '#111', secondary: '#555', tertiary: '#999' },
    } },
  }),
}))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

import { SellerPayoutCard, shouldShowSellerPayout } from '../SellerPayoutCard'

const creator: UserRef = {
  id: 'seller-1', first_name: 'A', last_name: 'B', avatar_url: null, review_score: null, is_seeker: false, country: 'NG',
}
const account: ExchangePayoutAccount = {
  kind: 'bank', bank_code: 'GTB', account_number: '0123456789', account_name: 'ADA OBI', country: 'NG',
}

const offer = (status: EscrowStatus, payout: ExchangePayoutAccount | null = account) => ({
  creator, payout_account: payout, status,
})

describe('shouldShowSellerPayout', () => {
  test.each<EscrowStatus>(['draft', 'open', 'accepted', 'submitted'])(
    'shows to the creator while the offer is live (%s)',
    (status) => {
      expect(shouldShowSellerPayout(offer(status), 'seller-1')).toBe(true)
    },
  )

  test('never shows to anyone but the creator', () => {
    expect(shouldShowSellerPayout(offer('open'), 'buyer-9')).toBe(false)
  })

  test('nothing to show when no account is bound', () => {
    expect(shouldShowSellerPayout(offer('open', null), 'seller-1')).toBe(false)
  })

  test.each<EscrowStatus>(['completed', 'cancelled', 'refunded', 'disputed', 'resolved'])(
    'hidden once the offer is settled or contested (%s)',
    (status) => {
      expect(shouldShowSellerPayout(offer(status), 'seller-1')).toBe(false)
    },
  )
})

test('renders the bound account: name, rail code and full number', () => {
  render(<SellerPayoutCard account={account} />)
  expect(screen.getByText('You receive payment into')).toBeTruthy()
  expect(screen.getByText('ADA OBI')).toBeTruthy()
  expect(screen.getByText('GTB · 0123456789')).toBeTruthy()
})
