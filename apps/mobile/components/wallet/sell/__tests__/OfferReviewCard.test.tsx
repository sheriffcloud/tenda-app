import { render, screen } from '@testing-library/react-native'
import { OfferReviewCard } from '../OfferReviewCard'

jest.mock('react-native-unistyles', () => ({ useUnistyles: () => ({ theme: { colors: {
  surface: { card: '#fff' }, border: { default: '#ddd', subtle: '#eee' },
  content: { primary: '#111', secondary: '#555', tertiary: '#777' },
  brand: { primary: '#05f', primarySurface: '#eef' },
} } }) }))
jest.mock('lucide-react-native', () => ({ ArrowDown: () => null }))

it('presents exact offer terms as structured review rows', () => {
  render(<OfferReviewCard
    amountRaw="2500000"
    assetId="USDC_SOL"
    fiatTotal={4_000}
    currencySymbol="₦"
    rate={1_600}
    assetSymbol="USDC"
    payoutLabel="058 · ******4821"
  />)

  expect(screen.getByText('2.5 USDC')).toBeTruthy()
  expect(screen.getByText('₦4,000')).toBeTruthy()
  expect(screen.getByText('₦1,600 / USDC')).toBeTruthy()
  expect(screen.getByText('058 · ******4821')).toBeTruthy()
})
