/**
 * SellAssetAmount — the shared "You sell" block. Verifies it collapses to the
 * precondition notice when there are no tradable options — forwarding BOTH the
 * tab's message and the SECTION, since #60 the notice is what decides which of
 * the four causes to name — and otherwise shows the asset picker + amount.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import type { AssetSelection } from '../useAssetSelection'

jest.mock('@/components/ui/SectionLabel', () => {
  const { Text } = require('react-native')
  return { SectionLabel: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/ui/Input', () => {
  const { TextInput } = require('react-native')
  return { Input: ({ value, onChangeText }: { value: string; onChangeText: (t: string) => void }) => (
    <TextInput accessibilityLabel="amount" value={value} onChangeText={onChangeText} />
  ) }
})
jest.mock('@/components/exchange/AssetChainPicker', () => {
  const { Text } = require('react-native')
  return { AssetChainPicker: () => <Text>ASSET_PICKER</Text> }
})
const mockRetryWalletSync = jest.fn()
const mockEnsureLoaded = jest.fn()
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (s: (v: object) => unknown) => s({ retryWalletSync: mockRetryWalletSync }),
}))
jest.mock('@/stores/chain-registry.store', () => ({
  useChainRegistryStore: (s: (v: object) => unknown) => s({ ensureLoaded: mockEnsureLoaded }),
}))
jest.mock('../SellWalletNotice', () => {
  const { Text, Pressable } = require('react-native')
  // Renders the inputs AND exposes both callbacks: which message a section
  // produces is SellWalletNotice's own test, but which LOAD each retry fires
  // is this file's — and pointing them both at the same store action used to
  // change nothing any test could see.
  return {
    SellWalletNotice: ({ section, noWalletMessage, onRetryWallets, onRetryChains }: {
      section: string
      noWalletMessage: string
      onRetryWallets: () => void
      onRetryChains: () => void
    }) => (
      <>
        <Text>{`NOTICE:${section}:${noWalletMessage}`}</Text>
        <Pressable accessibilityRole="button" onPress={onRetryWallets}><Text>RETRY_WALLETS</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={onRetryChains}><Text>RETRY_CHAINS</Text></Pressable>
      </>
    ),
  }
})

import { SellAssetAmount } from '../SellAssetAmount'

beforeEach(() => jest.clearAllMocks())

function selection(options: unknown[], section: AssetSelection['section'] = 'no-wallet'): AssetSelection {
  return {
    options, section, option: options[0] ?? null, selectedKey: 'k', select: jest.fn(),
  } as AssetSelection
}

test('shows the link-a-wallet notice (with the tab message) when no options', () => {
  render(
    <SellAssetAmount selection={selection([])} amount="" onAmountChange={jest.fn()} noWalletMessage="Link a wallet to post an offer." />,
  )
  expect(screen.getByText('NOTICE:no-wallet:Link a wallet to post an offer.')).toBeTruthy()
  expect(screen.queryByText('ASSET_PICKER')).toBeNull()
})

test('shows the asset picker + amount input when options exist and reports amount changes', () => {
  const onAmountChange = jest.fn()
  render(
    <SellAssetAmount
      selection={selection([{ chainId: 'c', assetId: 'a', symbol: 'USDC', decimals: 6, chainName: 'x', walletAddress: 'w' }])}
      amount="" onAmountChange={onAmountChange} noWalletMessage="x"
    />,
  )
  expect(screen.getByText('ASSET_PICKER')).toBeTruthy()
  fireEvent.changeText(screen.getByLabelText('amount'), '10')
  expect(onAmountChange).toHaveBeenCalledWith('10')
})

test('each retry fires its OWN load — one action wired to both would strand the other', () => {
  render(<SellAssetAmount selection={selection([])} amount="" onAmountChange={jest.fn()}
      noWalletMessage="Link a wallet to post an offer." />)

  fireEvent.press(screen.getByText('RETRY_WALLETS'))
  expect(mockRetryWalletSync).toHaveBeenCalledTimes(1)
  expect(mockEnsureLoaded).not.toHaveBeenCalled()

  fireEvent.press(screen.getByText('RETRY_CHAINS'))
  expect(mockEnsureLoaded).toHaveBeenCalledTimes(1)
  expect(mockRetryWalletSync).toHaveBeenCalledTimes(1)
})
