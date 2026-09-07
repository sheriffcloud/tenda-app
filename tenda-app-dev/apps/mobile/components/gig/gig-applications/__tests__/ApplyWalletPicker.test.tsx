/**
 * The apply-time wallet picker.
 *
 * The three not-a-list states are what this file is really about. An empty
 * picker while the trust list is loading — or after it failed — reads exactly
 * like "you have no wallet", and that dead end is what sent applicants to
 * Settings for a wallet they already had. Each state must say which one it is
 * and offer the way out that actually fits it.
 */
import { render, screen, fireEvent } from '@testing-library/react-native'
import type { LinkedWallet } from '@tenda/shared'
import {
  APPLY_WALLET_HINT,
  APPLY_WALLET_LABEL,
  APPLY_WALLET_LINK_CTA,
  APPLY_WALLET_LOADING,
  APPLY_WALLET_LOAD_FAILED,
  APPLY_WALLET_REQUIRED,
  APPLY_WALLET_RETRY,
  chainLabel,
} from '@tenda/shared'
import { ApplyWalletPicker } from '../ApplyWalletPicker'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        brand: { primary: '#25f', primarySurface: '#eef' },
        border: { default: '#ddd' },
        surface: { card: '#fff' },
        content: { primary: '#111', secondary: '#666', tertiary: '#999' },
        feedback: { danger: { surface: '#fee', base: '#c00' } },
      },
    },
  }),
}))
jest.mock('@/components/ui', () => {
  const { Text, Pressable } = require('react-native')
  return {
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Badge: ({ label }: { label: string }) => <Text>{label}</Text>,
    // A real Pressable, so an assertion about pressing the CTA fails when the
    // handler is not wired rather than passing against a bare label.
    Button: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
  }
})

const CHAIN = 'eip155:84532'

function wallet(over: Partial<LinkedWallet>): LinkedWallet {
  return {
    chain_ns: 'eip155',
    address: '0xAaaa1111',
    is_primary: false,
    verified_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function setup(over: Partial<Parameters<typeof ApplyWalletPicker>[0]> = {}) {
  const onSelect = jest.fn()
  const onRetry = jest.fn()
  render(
    <ApplyWalletPicker
      chainId={CHAIN}
      status="ready"
      options={[]}
      selected={null}
      onSelect={onSelect}
      onRetry={onRetry}
      {...over}
    />,
  )
  return { onSelect, onRetry }
}

beforeEach(() => mockPush.mockClear())

test('a still-loading trust list says so instead of showing an empty picker', () => {
  setup({ status: 'loading' })
  expect(screen.getByText(APPLY_WALLET_LOADING)).toBeTruthy()
  expect(screen.queryByText(APPLY_WALLET_REQUIRED(chainLabel(CHAIN)))).toBeNull()
})

test('an untouched (idle) list is treated as loading, never as "none linked"', () => {
  setup({ status: 'idle' })
  expect(screen.getByText(APPLY_WALLET_LOADING)).toBeTruthy()
})

test('a FAILED load offers a retry rather than the link-a-wallet dead end', () => {
  const { onRetry } = setup({ status: 'error' })

  expect(screen.getByText(APPLY_WALLET_LOAD_FAILED)).toBeTruthy()
  expect(screen.queryByText(APPLY_WALLET_LINK_CTA)).toBeNull()

  fireEvent.press(screen.getByText(APPLY_WALLET_RETRY))
  expect(onRetry).toHaveBeenCalled()
})

test('zero wallets on the gig chain names the chain and routes to linking one', () => {
  setup({ status: 'ready', options: [] })

  expect(screen.getByText(APPLY_WALLET_REQUIRED(chainLabel(CHAIN)))).toBeTruthy()
  fireEvent.press(screen.getByText(APPLY_WALLET_LINK_CTA))
  expect(mockPush).toHaveBeenCalledWith('/settings/linked-wallets')
})

test('an unknown chain id still routes rather than rendering a dead picker', () => {
  // findChain returns undefined, so there is no namespace to filter on and the
  // options are empty by construction — the applicant must still get a way out.
  setup({ chainId: 'eip155:999999', status: 'ready', options: [] })
  expect(screen.getByText(APPLY_WALLET_REQUIRED('Unknown'))).toBeTruthy()
})

test('each linked wallet is offered, with the primary marked', () => {
  setup({
    options: [wallet({ address: '0xPrimary1', is_primary: true }), wallet({ address: '0xSecond22' })],
    selected: '0xPrimary1',
  })

  expect(screen.getByText(APPLY_WALLET_LABEL)).toBeTruthy()
  expect(screen.getByText(APPLY_WALLET_HINT)).toBeTruthy()
  expect(screen.getAllByRole('radio')).toHaveLength(2)
  expect(screen.getByText('Primary')).toBeTruthy()
})

test('the selected row is the one reported as selected, and only it', () => {
  setup({
    options: [wallet({ address: '0xPrimary1', is_primary: true }), wallet({ address: '0xSecond22' })],
    selected: '0xSecond22',
  })

  const states = screen.getAllByRole('radio').map((r) => r.props.accessibilityState.selected)
  expect(states).toEqual([false, true])
})

test('tapping a row reports THAT address, not the one already selected', () => {
  const { onSelect } = setup({
    options: [wallet({ address: '0xPrimary1', is_primary: true }), wallet({ address: '0xSecond22' })],
    selected: '0xPrimary1',
  })

  fireEvent.press(screen.getAllByRole('radio')[1])
  expect(onSelect).toHaveBeenCalledWith('0xSecond22')
})
