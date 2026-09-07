/**
 * The "You sell" block — mobile's field order is the contract: the reader
 * picks WHAT they are selling before saying how much of it. The order test
 * reads the DOM relationship, not the code, so swapping the blocks back
 * (the pre-#50 layout: amount first, chips below) fails it.
 */
import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SellAssetAmount } from '@/components/wallet/sell/SellAssetAmount'
import { SELL_WALLET_CHECKING } from '@tenda/shared'
import { useAuthStore } from '@/stores/auth.store'
import { useChainRegistryStore } from '@/stores/chain-registry.store'
import { SELL_COPY } from '@/components/wallet/sell/copy'
import type { ExchangeAssetOption } from '@/hooks/exchange/useExchangeAssetOptions'
import type { AssetSelection } from '@/hooks/wallet/useAssetSelection'

// Complete, uncast: a fixture is a claim about what the producer can send,
// and `useExchangeAssetOptions` never emits an option without a chainName.
const usdcSol: ExchangeAssetOption = {
  chainId: 'solana:devnet',
  assetId: 'USDC_SOL',
  symbol: 'USDC',
  decimals: 6,
  chainName: 'Solana Devnet',
  walletAddress: 'SoLAddr1',
}
const usdcBase: ExchangeAssetOption = {
  ...usdcSol,
  chainId: 'eip155:84532',
  assetId: 'USDC_BASE',
  chainName: 'Base Sepolia',
}

function selectionOf(
  options: ExchangeAssetOption[],
  section: AssetSelection['section'] = options.length > 0 ? 'ready' : 'no-wallet',
): AssetSelection {
  return {
    options,
    section,
    option: options[0] ?? null,
    selectedKey: `${options[0]?.chainId}:${options[0]?.assetId}:${options[0]?.walletAddress}`,
    select: vi.fn(),
  }
}

it('renders the asset picker BEFORE the amount input (mobile order)', () => {
  render(
    <SellAssetAmount
      selection={selectionOf([usdcSol, usdcBase])}
      amount=""
      onAmountChange={vi.fn()}
      noWalletMessage="Link a wallet to post an offer."
    />,
  )
  const picker = screen.getByRole('group', { name: SELL_COPY.assetLabel })
  const amount = screen.getByLabelText(SELL_COPY.amountLabel)
  expect(
    picker.compareDocumentPosition(amount) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
})

it('shows the picker even with ONE option — the chip states what is being sold', () => {
  render(<SellAssetAmount selection={selectionOf([usdcSol])} amount="" onAmountChange={vi.fn()}
      noWalletMessage="Link a wallet to post an offer." />)
  expect(screen.getByRole('group', { name: SELL_COPY.assetLabel })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /USDC/ })).toHaveAttribute('aria-pressed', 'true')
})

it('clicking a chip selects that option', () => {
  const selection = selectionOf([usdcSol, usdcBase])
  render(<SellAssetAmount selection={selection} amount="" onAmountChange={vi.fn()}
      noWalletMessage="Link a wallet to post an offer." />)
  fireEvent.click(screen.getByRole('button', { name: /Base/ }))
  expect(selection.select).toHaveBeenCalledWith(usdcBase)
})

it('renders the precondition notice, and forwards WHICH cause it is (#60)', () => {
  // The wiring, not the copy: hardcoding the section here used to change
  // nothing any test could see, so a surface that showed the wrong cause —
  // or none — would have shipped.
  render(<SellAssetAmount selection={selectionOf([], 'no-wallet')} amount="" onAmountChange={vi.fn()}
      noWalletMessage="Link a wallet to post an offer." />)
  expect(screen.getByText('Link a wallet to post an offer.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Link a wallet' })).toBeInTheDocument()
})

it('a still-loading list is NOT told it has no wallet', () => {
  render(<SellAssetAmount selection={selectionOf([], 'loading')} amount="" onAmountChange={vi.fn()}
      noWalletMessage="Link a wallet to post an offer." />)
  expect(screen.queryByText('Link a wallet to post an offer.')).not.toBeInTheDocument()
  expect(screen.getByText(SELL_WALLET_CHECKING)).toBeInTheDocument()
})

it('a READY surface shows no notice at all', () => {
  render(<SellAssetAmount selection={selectionOf([usdcSol])} amount="" onAmountChange={vi.fn()}
      noWalletMessage="Link a wallet to post an offer." />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('with NO options (wallet unlinked mid-session) the picker goes, the amount field stays', () => {
  // The notice renders beside it since #60 — what this guards is that losing
  // every option mid-session does not take the typed amount off screen with it.
  render(<SellAssetAmount selection={selectionOf([])} amount="" onAmountChange={vi.fn()}
      noWalletMessage="Link a wallet to post an offer." />)
  expect(screen.queryByRole('group', { name: SELL_COPY.assetLabel })).toBeNull()
  expect(screen.getByLabelText(SELL_COPY.amountLabel)).toBeInTheDocument()
})

it('typing forwards through onAmountChange — the field is controlled, not local', () => {
  const onAmountChange = vi.fn()
  render(
    <SellAssetAmount selection={selectionOf([usdcSol])} amount="" onAmountChange={onAmountChange}
      noWalletMessage="Link a wallet to post an offer." />,
  )
  fireEvent.change(screen.getByLabelText(SELL_COPY.amountLabel), { target: { value: '25' } })
  expect(onAmountChange).toHaveBeenCalledWith('25')
})

it('each retry fires its OWN load — one action wired to both would strand the other', () => {
  // The wiring, through the real notice: pointing both props at the same store
  // action used to change nothing any test could see.
  const refreshWallets = vi.fn(async () => {})
  const fetchChains = vi.fn(async () => {})
  // Restored below: these are the REAL stores, and a stubbed action left behind
  // would be inherited by whatever test is added after this one.
  const realRefresh = useAuthStore.getState().refreshWallets
  const realFetch = useChainRegistryStore.getState().fetch
  useAuthStore.setState({ refreshWallets })
  useChainRegistryStore.setState({ fetch: fetchChains })

  const { unmount } = render(
    <SellAssetAmount selection={selectionOf([], 'wallets-error')} amount="" onAmountChange={vi.fn()}
      noWalletMessage="Link a wallet to post an offer." />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(refreshWallets).toHaveBeenCalledTimes(1)
  expect(fetchChains).not.toHaveBeenCalled()
  unmount()

  render(
    <SellAssetAmount selection={selectionOf([], 'balances-unavailable')} amount="" onAmountChange={vi.fn()}
      noWalletMessage="Link a wallet to post an offer." />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(fetchChains).toHaveBeenCalledTimes(1)
  expect(refreshWallets).toHaveBeenCalledTimes(1)

  useAuthStore.setState({ refreshWallets: realRefresh })
  useChainRegistryStore.setState({ fetch: realFetch })
})
