/**
 * The wallet guide page renders the SHARED array in its own order, and that
 * order is a product decision (EVM leads, Celo first inside it) rather than an
 * accident of how the file was typed. Three things here are only true on this
 * surface and so cannot be asserted in the shared content suite:
 *
 *   - the FIRST card is the one open on arrival (`defaultOpen={i === 0}`), so
 *     the reader who never scrolls sees the EVM wallets;
 *   - the badge reaches the DOM at all. Mobile has always drawn it; web
 *     dropped it, which quietly turned "these are tested" into "these exist";
 *   - the Celo gas warning sits INSIDE its own card, so the Solana cards do
 *     not tell a reader to go and hold CELO.
 *
 * Queried through the `<details>` elements rather than by ARIA role: the
 * accordion is native `<details>/<summary>` on purpose (the answers belong in
 * the HTML on an anonymous page), and jsdom does not map those to the roles a
 * `getByRole` query would need.
 */
import { render, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { SUPPORT_WALLET_GUIDE } from '@tenda/shared'
import WalletGuidePage from '../wallet/page'

function cards(container: HTMLElement): HTMLDetailsElement[] {
  return Array.from(container.querySelectorAll('details'))
}

test('opens on the EVM card, with Celo named first and paused Base not named at all', () => {
  const { container } = render(<WalletGuidePage />)
  const first = SUPPORT_WALLET_GUIDE[0]
  expect(first.network).toBe('evm')
  // Celo leads every EVM mention (support order). Base is PAUSED (2026-10-02),
  // so it is not in the copy; re-enabling it brings it back, after Celo.
  expect(first.name).toContain('Celo')
  expect(first.name.indexOf('Celo')).toBeLessThan(first.name.indexOf('0G'))
  expect(first.name).not.toContain('Base')

  const walletCards = cards(container).slice(0, SUPPORT_WALLET_GUIDE.length)
  expect(within(walletCards[0]).getByText(first.name)).toBeInTheDocument()
  expect(walletCards[0].open).toBe(true)
  // Exactly one is open — a second default-open card would bury the first.
  expect(walletCards.filter((c) => c.open)).toHaveLength(1)
})

test('shows every card its badge, so a tested wallet reads as tested', () => {
  const { container } = render(<WalletGuidePage />)
  const walletCards = cards(container)
  for (const [i, wallet] of SUPPORT_WALLET_GUIDE.entries()) {
    expect(within(walletCards[i]).getByText(wallet.badge.label)).toBeInTheDocument()
  }
})

test('puts the Celo fee-currency warning inside the EVM card, not loose on the page', () => {
  const { container } = render(<WalletGuidePage />)
  const evm = SUPPORT_WALLET_GUIDE[0]
  expect(evm.note).not.toBeUndefined()
  const walletCards = cards(container)
  expect(within(walletCards[0]).getByText(evm.note ?? '')).toBeInTheDocument()
  for (const card of walletCards.slice(1)) {
    expect(within(card).queryByText(evm.note ?? '')).toBeNull()
  }
})
