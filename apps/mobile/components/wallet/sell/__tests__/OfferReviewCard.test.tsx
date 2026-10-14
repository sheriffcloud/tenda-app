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
    currency="NGN"
    rate={1_600}
    assetSymbol="USDC"
    payoutLabel="058 · ******4821"
  />)

  expect(screen.getByText('2.5 USDC')).toBeTruthy()
  expect(screen.getByText('₦4,000')).toBeTruthy()
  expect(screen.getByText('₦1,600 / USDC')).toBeTruthy()
  expect(screen.getByText('058 · ******4821')).toBeTruthy()
})

it('formats fiat in the payout currency\'s own locale, not a hardcoded US one', () => {
  // The card used to build fiat by hand — `${symbol}${value.toLocaleString('en-US')}`
  // — which pins US separators and prepends the symbol. Neither is right
  // outside en-*: the euro groups with '.' and takes a SUFFIX symbol, so a
  // seller reviewing a €4,000 offer was shown "€4,000" where their locale
  // reads "4.000 €". `formatFiat` already owns both facts.
  render(<OfferReviewCard
    amountRaw="2500000"
    assetId="USDC_SOL"
    fiatTotal={4_000}
    currency="EUR"
    rate={1.55}
    assetSymbol="USDC"
    payoutLabel="058 · ******4821"
  />)

  expect(screen.getByText('4.000 €')).toBeTruthy()
  expect(screen.queryByText('€4,000')).toBeNull()
})

it('formats the rate through the shared rate rule, decimals and all', () => {
  // `formatRate` keeps two decimals on a fractional rate — the figure an order
  // book exists to compare — and drops them on a whole one. Hand-rolling it
  // here meant this screen and the exchange detail could disagree about the
  // same number.
  render(<OfferReviewCard
    amountRaw="2500000"
    assetId="USDC_SOL"
    fiatTotal={4_000}
    currency="GHS"
    rate={15.4}
    assetSymbol="USDC"
    payoutLabel="058 · ******4821"
  />)

  expect(screen.getByText('GH₵15.40 / USDC')).toBeTruthy()
  expect(screen.getByText('GH₵4,000')).toBeTruthy()
})
