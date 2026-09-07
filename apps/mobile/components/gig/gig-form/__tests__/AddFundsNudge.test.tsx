/**
 * AddFundsNudge — the advisory "your balance won't cover this" warning on the
 * gig form.
 *
 * REGRESSION GUARD: the old implementation compared the budget against native
 * SOL and skipped stablecoins (`is_stable !== true`), so it never once fired
 * for a real gig — gig policy pins the asset to USDC via `gigAssetByChain`.
 * The first test below is the case that was silently dead.
 */
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockUseSpendableBalance = jest.fn()
jest.mock('@/hooks/useSpendableBalance', () => ({
  useSpendableBalance: (...a: unknown[]) => mockUseSpendableBalance(...a),
}))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        brand: { primary: '#0a0', primarySurface: '#efe', primaryBorder: '#cfc', onPrimary: '#fff' },
        surface: { background: '#fff' },
        content: { primary: '#000', secondary: '#333' },
      },
    },
  }),
}))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

import { AddFundsNudge } from '@/components/gig/gig-form/AddFundsNudge'

const CHAIN = 'solana:devnet'
const USDC = 'USDC_SOL'

/** A known balance of `amountRaw` base units. */
function known(amountRaw: string) {
  return {
    balance: { assetId: USDC, symbol: 'USDC', amountRaw, decimals: 6, isStable: true },
    status: 'ready' as const,
    refresh: jest.fn(),
  }
}
const UNKNOWN = { balance: null, status: 'ready' as const, refresh: jest.fn() }
const LOADING = { balance: null, status: 'loading' as const, refresh: jest.fn() }

const NUDGE = 'Add funds'

beforeEach(() => {
  mockUseSpendableBalance.mockReset()
  mockPush.mockReset()
})

test('fires for a USDC budget above the USDC balance (the case that never fired)', () => {
  mockUseSpendableBalance.mockReturnValue(known('5000000')) // 5 USDC

  render(<AddFundsNudge chainId={CHAIN} asset={USDC} paymentRaw={10_000_000} />)

  expect(screen.getByLabelText(NUDGE)).toBeTruthy()
})

test('reads the balance for the form’s selected chain and asset', () => {
  mockUseSpendableBalance.mockReturnValue(known('5000000'))

  render(<AddFundsNudge chainId="eip155:84532" asset="USDC_BASE" paymentRaw={1} />)

  expect(mockUseSpendableBalance).toHaveBeenCalledWith('eip155:84532', 'USDC_BASE')
})

test('stays silent when the balance covers the budget', () => {
  mockUseSpendableBalance.mockReturnValue(known('50000000'))

  render(<AddFundsNudge chainId={CHAIN} asset={USDC} paymentRaw={10_000_000} />)

  expect(screen.queryByLabelText(NUDGE)).toBeNull()
})

test('stays silent when the budget exactly equals the balance', () => {
  mockUseSpendableBalance.mockReturnValue(known('10000000'))

  render(<AddFundsNudge chainId={CHAIN} asset={USDC} paymentRaw={10_000_000} />)

  expect(screen.queryByLabelText(NUDGE)).toBeNull()
})

test('fires one base unit over', () => {
  mockUseSpendableBalance.mockReturnValue(known('10000000'))

  render(<AddFundsNudge chainId={CHAIN} asset={USDC} paymentRaw={10_000_001} />)

  expect(screen.getByLabelText(NUDGE)).toBeTruthy()
})

test('an UNKNOWN balance never accuses the user of being short', () => {
  mockUseSpendableBalance.mockReturnValue(UNKNOWN)

  render(<AddFundsNudge chainId={CHAIN} asset={USDC} paymentRaw={10_000_000} />)

  expect(screen.queryByLabelText(NUDGE)).toBeNull()
})

test('stays silent while the balance is still loading', () => {
  mockUseSpendableBalance.mockReturnValue(LOADING)

  render(<AddFundsNudge chainId={CHAIN} asset={USDC} paymentRaw={10_000_000} />)

  expect(screen.queryByLabelText(NUDGE)).toBeNull()
})

test('an empty budget never nudges', () => {
  mockUseSpendableBalance.mockReturnValue(known('0'))

  render(<AddFundsNudge chainId={CHAIN} asset={USDC} paymentRaw={0} />)

  expect(screen.queryByLabelText(NUDGE)).toBeNull()
})

test('a zero balance with a real budget nudges', () => {
  mockUseSpendableBalance.mockReturnValue(known('0'))

  render(<AddFundsNudge chainId={CHAIN} asset={USDC} paymentRaw={1_000_000} />)

  expect(screen.getByLabelText(NUDGE)).toBeTruthy()
})

test('tapping it routes to the exchange so the draft survives the detour', () => {
  mockUseSpendableBalance.mockReturnValue(known('5000000'))
  render(<AddFundsNudge chainId={CHAIN} asset={USDC} paymentRaw={10_000_000} />)

  fireEvent.press(screen.getByLabelText(NUDGE))

  expect(mockPush).toHaveBeenCalledWith('/exchange')
})

test('an unparseable budget stays silent instead of crashing the form', () => {
  // A draft whose amount_raw came back malformed reaches the form as NaN. A
  // bare BigInt(NaN) throws — an advisory hint must never take the screen down.
  mockUseSpendableBalance.mockReturnValue(known('5000000'))

  expect(() =>
    render(<AddFundsNudge chainId={CHAIN} asset={USDC} paymentRaw={NaN} />),
  ).not.toThrow()
  expect(screen.queryByLabelText(NUDGE)).toBeNull()
})

test('an unparseable BALANCE stays silent rather than throwing', () => {
  mockUseSpendableBalance.mockReturnValue(known('not-a-number'))

  expect(() =>
    render(<AddFundsNudge chainId={CHAIN} asset={USDC} paymentRaw={10_000_000} />),
  ).not.toThrow()
  expect(screen.queryByLabelText(NUDGE)).toBeNull()
})
