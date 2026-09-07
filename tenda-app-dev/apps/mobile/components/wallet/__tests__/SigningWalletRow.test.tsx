/**
 * The signer preview row.
 *
 * This is the ONE place a reader is told which wallet is about to open, so the
 * two things it must never get wrong are the address it names and the promise
 * its button makes: on a bound escrow "Switch" would offer a choice the chain
 * will not honour.
 */
import { render, screen, fireEvent } from '@testing-library/react-native'
import { chainLabel, SIGNING_WALLET_COPY } from '@tenda/shared'

const mockSigner = {
  namespace: 'eip155' as string | null,
  address: '0xAaaa1111' as string | null,
  bound: false,
  switching: false,
  error: null as string | null,
  switchWith: jest.fn(),
}
jest.mock('@/hooks/wallet/useSigningWallet', () => ({
  useSigningWallet: (...a: unknown[]) => {
    mockUseSigningWallet(...a)
    return mockSigner
  },
}))
const mockUseSigningWallet = jest.fn()

// The picker's own suite covers the wallet list; here it is a button that
// hands one adapter back, so what is asserted is the WIRING.
const ADAPTER = { id: 'walletconnect' }
jest.mock('@/wallet/picker', () => {
  const { Text } = require('react-native')
  return {
    WalletPicker: ({
      visible,
      namespace,
      onSelect,
      onClose,
    }: {
      visible: boolean
      namespace?: string
      onSelect: (a: unknown) => void
      onClose: () => void
    }) =>
      visible ? (
        <>
          <Text>{`picker-ns:${String(namespace)}`}</Text>
          <Text onPress={() => onSelect(ADAPTER)}>pick-wallet</Text>
          <Text onPress={onClose}>dismiss-picker</Text>
        </>
      ) : null,
  }
})
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { card: '#fff' },
        border: { subtle: '#eee' },
        content: { primary: '#111', secondary: '#666' },
        feedback: { danger: { base: '#c00' } },
      },
    },
  }),
}))
jest.mock('@/components/ui/Button', () => {
  const { Pressable, Text } = require('react-native')
  return {
    Button: ({
      children,
      onPress,
      disabled,
    }: {
      children: React.ReactNode
      onPress: () => void
      disabled?: boolean
    }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled === true }}
        disabled={disabled}
        onPress={onPress}
      >
        <Text>{children}</Text>
      </Pressable>
    ),
  }
})

// eslint-disable-next-line import/first
import { SigningWalletRow } from '@/components/wallet/SigningWalletRow'

const CHAIN = 'eip155:84532'

beforeEach(() => {
  mockUseSigningWallet.mockClear()
  mockSigner.switchWith.mockClear().mockResolvedValue(undefined)
  Object.assign(mockSigner, {
    namespace: 'eip155',
    address: '0xAaaa1111',
    bound: false,
    switching: false,
    error: null,
  })
})

test('names the wallet and the chain it will sign on', () => {
  render(<SigningWalletRow chainId={CHAIN} />)

  expect(screen.getByText('0xAa…1111')).toBeTruthy()
  expect(screen.getByText(SIGNING_WALLET_COPY.chainSuffix(chainLabel(CHAIN)), { exact: false })).toBeTruthy()
})

test('a FREE signer offers a Switch', () => {
  render(<SigningWalletRow chainId={CHAIN} />)
  expect(screen.getByText(SIGNING_WALLET_COPY.switchAction)).toBeTruthy()
})

test('a BOUND signer offers Connect — there is no choice left to make', () => {
  // "Switch" here would promise a freedom the chain does not allow.
  mockSigner.bound = true
  render(<SigningWalletRow chainId={CHAIN} bound="0xBound" />)

  expect(screen.getByText(SIGNING_WALLET_COPY.connectAction)).toBeTruthy()
  expect(screen.queryByText(SIGNING_WALLET_COPY.switchAction)).toBeNull()
})

test('the binding is handed to the hook, so the preview is the bound wallet', () => {
  render(<SigningWalletRow chainId={CHAIN} bound="0xBound" />)
  expect(mockUseSigningWallet).toHaveBeenCalledWith(CHAIN, '0xBound')
})

test('no binding passed reads as null, not undefined, at the hook', () => {
  render(<SigningWalletRow chainId={CHAIN} />)
  expect(mockUseSigningWallet).toHaveBeenCalledWith(CHAIN, null)
})

test('nothing linked says so instead of leaving a blank where an address goes', () => {
  mockSigner.address = null
  render(<SigningWalletRow chainId={CHAIN} />)
  expect(screen.getByText(SIGNING_WALLET_COPY.noWallet)).toBeTruthy()
})

test('a switch in flight holds the button and says it is waiting', () => {
  mockSigner.switching = true
  render(<SigningWalletRow chainId={CHAIN} />)

  expect(screen.getByText(SIGNING_WALLET_COPY.waiting)).toBeTruthy()
  expect(screen.getByRole('button').props.accessibilityState.disabled).toBe(true)
})

test('a failed switch is shown as an alert, not swallowed', () => {
  mockSigner.error = 'Connect 0xBo…und1'
  render(<SigningWalletRow chainId={CHAIN} />)
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(screen.getByText('Connect 0xBo…und1')).toBeTruthy()
})

test('the picker is closed until asked for, then its pick drives the switch', () => {
  render(<SigningWalletRow chainId={CHAIN} />)
  expect(screen.queryByText('pick-wallet')).toBeNull()

  fireEvent.press(screen.getByRole('button'))
  fireEvent.press(screen.getByText('pick-wallet'))

  expect(mockSigner.switchWith).toHaveBeenCalledWith(ADAPTER)
  // And it closes behind the pick, rather than sitting over the sheet.
  expect(screen.queryByText('pick-wallet')).toBeNull()
})

test('the picker is SCOPED to the escrow chain — a Solana wallet cannot sign an EVM escrow', () => {
  // Unscoped, the reader picks a wallet that can only ever be refused; the
  // refusal names wallets on the wrong chain and there is nothing to do.
  render(<SigningWalletRow chainId={CHAIN} />)

  fireEvent.press(screen.getByRole('button'))
  expect(screen.getByText('picker-ns:eip155')).toBeTruthy()
})

test('dismissing the picker closes it and changes nothing', () => {
  render(<SigningWalletRow chainId={CHAIN} />)

  fireEvent.press(screen.getByRole('button'))
  fireEvent.press(screen.getByText('dismiss-picker'))

  expect(screen.queryByText('pick-wallet')).toBeNull()
  expect(mockSigner.switchWith).not.toHaveBeenCalled()
})

test('a chain with no namespace renders nothing at all', () => {
  // No namespace means no wallet to name and no switch that could succeed;
  // an empty row would read as "you have no wallet".
  mockSigner.namespace = null
  render(<SigningWalletRow chainId="eip155:999999" />)
  expect(screen.queryByRole('button')).toBeNull()
})
