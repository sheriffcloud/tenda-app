/**
 * The sell surface's precondition (#60). What it says, and — the half that was
 * wrong — WHEN it is allowed to say the one thing about the reader.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import {
  SELL_CHAINS_UNAVAILABLE,
  SELL_NO_WALLET_OFFER,
  SELL_WALLET_CHECKING,
  SELL_WALLET_LOAD_FAILED,
} from '@tenda/shared'
import { SellWalletNotice } from '@/components/wallet/sell/SellWalletNotice'

function setup(section: Parameters<typeof SellWalletNotice>[0]['section']) {
  const onRetryWallets = vi.fn()
  const onRetryChains = vi.fn()
  const view = render(
    <SellWalletNotice
      section={section}
      noWalletMessage={SELL_NO_WALLET_OFFER}
      onRetryWallets={onRetryWallets}
      onRetryChains={onRetryChains}
    />,
  )
  return { onRetryWallets, onRetryChains, view }
}

test('a settled absence asks for a wallet and links out', () => {
  setup('no-wallet')
  expect(screen.getByText(SELL_NO_WALLET_OFFER)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Link a wallet' })).toHaveAttribute(
    'href',
    '/settings/linked-wallets',
  )
})

test('a usable surface says nothing — the picker takes over', () => {
  const { view } = setup('ready')
  expect(view.container).toBeEmptyDOMElement()
})

test('while it is still looking it says SO, and offers nothing to press', () => {
  // The claim that must be earned: web showed nothing here and mobile said
  // "link a wallet". Neither was true — we simply had not finished asking.
  setup('loading')
  expect(screen.getByText(SELL_WALLET_CHECKING)).toBeInTheDocument()
  expect(screen.queryByText(SELL_NO_WALLET_OFFER)).not.toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('a failed WALLETS load retries the wallets, and only the wallets', () => {
  const { onRetryWallets, onRetryChains } = setup('wallets-error')
  expect(screen.getByText(SELL_WALLET_LOAD_FAILED)).toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(onRetryWallets).toHaveBeenCalledTimes(1)
  expect(onRetryChains).not.toHaveBeenCalled()
})

test('a failed CHAINS load retries the chains — a single retry would strand it', () => {
  const { onRetryWallets, onRetryChains } = setup('balances-unavailable')
  expect(screen.getByText(SELL_CHAINS_UNAVAILABLE)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(onRetryChains).toHaveBeenCalledTimes(1)
  expect(onRetryWallets).not.toHaveBeenCalled()
})

test('no failure state ever borrows the no-wallet line or its link', () => {
  for (const section of ['loading', 'wallets-error', 'balances-unavailable'] as const) {
    const { view } = setup(section)
    expect(screen.queryByText(SELL_NO_WALLET_OFFER)).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    view.unmount()
  }
})

test('the notice is announced, not just drawn', () => {
  setup('no-wallet')
  expect(screen.getByRole('status')).toBeInTheDocument()
})
