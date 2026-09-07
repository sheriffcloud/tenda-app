/**
 * WalletPicker, renders one row per AVAILABLE adapter, captioned by its
 * `tagline` (falling back to the namespace label), with an install hint and a
 * tap-to-select. The registry is mocked with fixture adapters (icon + no-icon,
 * installed + not) so we exercise the picker AND the WalletIcon fallback glyph
 * without loading the real native adapter stack.
 */
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        brand: { primary: '#00f', primarySurface: '#eef' },
        surface: { card: '#fff' },
        feedback: { success: { base: '#0a0' } },
      },
    },
  }),
}))
jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native')
  return {
    CircleCheck: () => <Text>check</Text>,
    Wallet: () => <Text>wallet-glyph</Text>,
  }
})
jest.mock('@/components/ui/BottomSheet', () => {
  const { View } = require('react-native')
  return {
    BottomSheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? <View>{children}</View> : null,
  }
})
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

// Fixtures are built INSIDE the factory: jest hoists jest.mock above the file's
// imports/consts, so any out-of-scope reference would still be in its TDZ when
// the factory runs. Identity for assertions comes back via jest.requireMock.
jest.mock('../adapters/registry', () => {
  const make = (over: Record<string, unknown>) => ({
    isAvailable: jest.fn().mockResolvedValue(true),
    isInstalled: jest.fn().mockResolvedValue(true),
    namespaces: ['eip155'],
    ...over,
  })
  return {
    adapters: [
      make({
        id: 'walletconnect',
        name: 'EVM Wallet',
        tagline: 'MetaMask, Trust, Rainbow & more',
        iconSource: undefined,
      }),
      make({
        id: 'solana-wallet',
        name: 'Solana Wallet',
        tagline: 'Solflare, Phantom & more',
        iconSource: 1, // a fake require() handle
        namespaces: ['solana'],
        isInstalled: jest.fn().mockResolvedValue(false),
      }),
      make({
        id: 'multi',
        name: 'Multi-chain',
        iconSource: 2,
        namespaces: ['eip155', 'solana'], // no tagline → caption falls back to namespaces
      }),
      make({
        id: 'hidden',
        name: 'Hidden',
        isAvailable: jest.fn().mockResolvedValue(false),
        isInstalled: jest.fn().mockResolvedValue(false),
      }),
    ],
  }
})

import { WalletPicker } from '../picker'

describe('WalletPicker', () => {
  it('renders available adapters captioned by their tagline', async () => {
    render(<WalletPicker visible onClose={jest.fn()} onSelect={jest.fn()} />)
    expect(await screen.findByText('EVM Wallet')).toBeTruthy()
    expect(screen.getByText('MetaMask, Trust, Rainbow & more')).toBeTruthy()
    expect(screen.getByText('Solana Wallet')).toBeTruthy()
    expect(screen.getByText('Solflare, Phantom & more · not installed')).toBeTruthy()
  })

  it('captions a tagline-less adapter with its namespace labels', async () => {
    render(<WalletPicker visible onClose={jest.fn()} onSelect={jest.fn()} />)
    await screen.findByText('Multi-chain')
    expect(screen.getByText('EVM + Solana')).toBeTruthy()
  })

  it('omits adapters that are unavailable on this platform', async () => {
    render(<WalletPicker visible onClose={jest.fn()} onSelect={jest.fn()} />)
    await screen.findByText('EVM Wallet')
    expect(screen.queryByText('Hidden')).toBeNull()
  })

  it('shows the generic wallet glyph for an adapter without a bundled icon', async () => {
    render(<WalletPicker visible onClose={jest.fn()} onSelect={jest.fn()} />)
    await screen.findByText('EVM Wallet')
    // Only the icon-less EVM adapter renders the fallback glyph.
    expect(screen.getAllByText('wallet-glyph')).toHaveLength(1)
  })

  it('calls onSelect with the tapped adapter', async () => {
    const onSelect = jest.fn()
    render(<WalletPicker visible onClose={jest.fn()} onSelect={onSelect} />)
    fireEvent.press(await screen.findByText('EVM Wallet'))
    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'walletconnect' })),
    )
  })
})
