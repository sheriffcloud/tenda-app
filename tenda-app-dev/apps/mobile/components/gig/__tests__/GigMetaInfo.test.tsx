/**
 * The gig detail's fact card.
 *
 * Two things here are claims about MONEY and can never be decoration: the
 * worker-net line (gross minus this escrow's own fee tier) and the escrow
 * wallet row — which party a payout is bound to. The rest is the status-aware
 * single deadline row that replaced a stale "Accept by" sitting beside a
 * generic "Deadline".
 */
import { render, screen } from '@testing-library/react-native'
import { BOUND_WALLET_LABEL, type GigDetail } from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        content: { primary: '#111', secondary: '#666', tertiary: '#999' },
        border: { default: '#ddd', subtle: '#eee' },
        surface: { card: '#fff' },
        brand: { primary: '#25f' },
        feedback: { success: { surface: '#efe', base: '#0a0' } },
      },
    },
  }),
}))
let mockRates: Record<string, number> | null = { NGN: 1600 }
jest.mock('@/stores/exchange-rate.store', () => ({
  useExchangeRateStore: (sel: (s: unknown) => unknown) => sel({ rates: mockRates }),
}))
jest.mock('@/stores/settings.store', () => ({
  useSettingsStore: (sel: (s: unknown) => unknown) => sel({ currency: 'NGN' }),
}))
const mockFee = { netRaw: 9_500_000n as bigint | null, feePct: 5 as number | null }
jest.mock('@/hooks/useEscrowFee', () => ({ useEscrowFee: () => mockFee }))

// eslint-disable-next-line import/first
import { GigMetaInfo } from '../GigMetaInfo'

// Reset the module-scoped doubles HERE, not at the end of the test that
// changes them: an assertion that throws would leak its state into the next
// test and the failure would land on an innocent one.
beforeEach(() => {
  mockRates = { NGN: 1600 }
  mockFee.netRaw = 9_500_000n
  mockFee.feePct = 5
})

type Gig = React.ComponentProps<typeof GigMetaInfo>['gig']

function gig(over: Partial<Gig> = {}): Gig {
  return {
    city: 'Lagos',
    country: 'NG',
    remote: false,
    completion_duration_seconds: 86_400,
    amount_raw: '10000000',
    asset: 'USDC_SOL',
    status: 'open' as GigDetail['status'],
    is_seeker: false,
    my_signer_address: null,
    ...over,
  }
}

test('names the wallet THIS escrow bound the reader to', () => {
  // An assigned worker never chose it — the poster's assign baked it — so the
  // first they hear of it must not be a signature the chain refuses.
  render(<GigMetaInfo gig={gig({ my_signer_address: '0xBound111' })} deadlineLbl="in 2 days" />)

  expect(screen.getByText(BOUND_WALLET_LABEL)).toBeTruthy()
  expect(screen.getByText('0xBo…d111')).toBeTruthy()
})

test('shows no wallet row to a reader this escrow binds to nothing', () => {
  // The wire is viewer-relative: a stranger gets null, and a row labelled
  // "Your escrow wallet" with nothing in it is a lie.
  render(<GigMetaInfo gig={gig()} deadlineLbl="in 2 days" />)
  expect(screen.queryByText(BOUND_WALLET_LABEL)).toBeNull()
})

test('the deadline row is named for the status, not generically', () => {
  render(<GigMetaInfo gig={gig({ status: 'accepted' })} deadlineLbl="in 4 hours" />)

  expect(screen.getByText('Deliver by')).toBeTruthy()
  expect(screen.queryByText('Accept by')).toBeNull()
})

test('a status with no live deadline gets no deadline row at all', () => {
  render(<GigMetaInfo gig={gig({ status: 'completed' })} deadlineLbl="in 4 hours" />)

  expect(screen.queryByText('Accept by')).toBeNull()
  expect(screen.queryByText('Deliver by')).toBeNull()
  expect(screen.queryByText('Review by')).toBeNull()
})

test('a resolved deadline with no label to hang it on is not rendered either', () => {
  render(<GigMetaInfo gig={gig({ status: 'open' })} deadlineLbl={null} />)
  expect(screen.queryByText('Accept by')).toBeNull()
})

test('a remote gig reads Remote instead of a place it does not have', () => {
  render(<GigMetaInfo gig={gig({ remote: true, city: null, country: null })} deadlineLbl={null} />)
  expect(screen.getByText('Remote')).toBeTruthy()
})

test('a physical gig reads "City, Country" from the location registry', () => {
  render(<GigMetaInfo gig={gig()} deadlineLbl={null} />)
  expect(screen.getByText('Lagos, Nigeria')).toBeTruthy()
})

test('a physical gig with neither city nor country falls back rather than blanking', () => {
  render(<GigMetaInfo gig={gig({ city: null, country: null })} deadlineLbl={null} />)
  expect(screen.getByText('—')).toBeTruthy()
})

test('an unknown country code is shown as-is rather than dropped', () => {
  render(<GigMetaInfo gig={gig({ country: 'ZZ' })} deadlineLbl={null} />)
  expect(screen.getByText('Lagos, ZZ')).toBeTruthy()
})

test('a gig with no stated duration shows no "Deliver within" row', () => {
  render(<GigMetaInfo gig={gig({ completion_duration_seconds: null })} deadlineLbl={null} />)
  expect(screen.queryByText('Deliver within')).toBeNull()
})

test('quotes the WORKER net, not the gross the poster funded', () => {
  render(<GigMetaInfo gig={gig()} deadlineLbl={null} />)
  expect(screen.getByText(/Worker gets/)).toBeTruthy()
  expect(screen.getByText(/9\.5/)).toBeTruthy()
  expect(screen.getByText(/after 5% fee/)).toBeTruthy()
})

test('an unreadable fee leaves the net line out rather than inventing one', () => {
  mockFee.netRaw = null
  render(<GigMetaInfo gig={gig()} deadlineLbl={null} />)
  expect(screen.queryByText(/Worker gets/)).toBeNull()
})

test('a draft is not yet funded, so it claims no escrow', () => {
  render(<GigMetaInfo gig={gig({ status: 'draft' })} deadlineLbl={null} />)
  expect(screen.queryByText('ESCROW READY')).toBeNull()
})

test('anything past draft has the money locked, and says so', () => {
  render(<GigMetaInfo gig={gig()} deadlineLbl={null} />)
  expect(screen.getByText('ESCROW READY')).toBeTruthy()
})

test('a SOL gig carries a fiat equivalent; a stable one does not', () => {
  // The rate cache is SOL-denominated, so a fiat line on USDC would be a
  // conversion nothing measured.
  render(<GigMetaInfo gig={gig({ asset: 'SOL' })} deadlineLbl={null} />)
  expect(screen.getByText(/≈/)).toBeTruthy()

  screen.unmount()
  render(<GigMetaInfo gig={gig()} deadlineLbl={null} />)
  expect(screen.queryByText(/≈/)).toBeNull()
})

test('a SOL gig with NO rate cache yet shows no fiat line, rather than a wrong one', () => {
  // The cache is null until the first fetch answers. Multiplying by a missing
  // rate is how "≈ NaN" reaches a screen about money.
  mockRates = null
  render(<GigMetaInfo gig={gig({ asset: 'SOL' })} deadlineLbl={null} />)

  expect(screen.queryByText(/≈/)).toBeNull()
})

test('an asset the registry does not know is shown by its raw key', () => {
  render(<GigMetaInfo gig={gig({ asset: 'MYSTERY' })} deadlineLbl={null} />)
  expect(screen.getByText('MYSTERY')).toBeTruthy()
})
