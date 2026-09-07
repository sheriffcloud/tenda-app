/**
 * SellAssetAmount — the shared "You sell" block. Verifies it collapses to the
 * link-a-wallet notice (with the tab's message) when there are no tradable
 * options, and otherwise shows the asset picker + amount input.
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
jest.mock('@/components/wallet/NoLinkedWalletNotice', () => {
  const { Text } = require('react-native')
  return { NoLinkedWalletNotice: ({ message }: { message: string }) => <Text>{`NOTICE:${message}`}</Text> }
})

import { SellAssetAmount } from '../SellAssetAmount'

function selection(options: unknown[]): AssetSelection {
  return { options, option: options[0] ?? null, selectedKey: 'k', select: jest.fn() } as AssetSelection
}

test('shows the link-a-wallet notice (with the tab message) when no options', () => {
  render(
    <SellAssetAmount selection={selection([])} amount="" onAmountChange={jest.fn()} noWalletMessage="Link a wallet to post an offer." />,
  )
  expect(screen.getByText('NOTICE:Link a wallet to post an offer.')).toBeTruthy()
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
