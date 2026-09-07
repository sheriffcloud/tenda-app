/**
 * The wallet's action row.
 *
 * This is the #19 definition of done: NO Buy affordance anywhere. Onramp was
 * retired in #61 and the comp still draws "Buy USDC" — so the assertion is an
 * absence, and it covers a disabled button as well as a live one, because a
 * control that can never work is worse than a row that never claimed one.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WalletActions } from '@/components/wallet/WalletActions'
import { WALLET_COPY } from '@/components/wallet/copy'

describe('WalletActions', () => {
  it('offers the two things a holder can actually do', () => {
    render(<WalletActions />)
    expect(screen.getByRole('link', { name: new RegExp(WALLET_COPY.sell) })).toHaveAttribute(
      'href',
      '/wallet/buy-sell',
    )
    expect(screen.getByRole('link', { name: new RegExp(WALLET_COPY.offers) })).toHaveAttribute(
      'href',
      '/exchange',
    )
  })

  it('names no TICKER — the surface it opens sells whatever the reader holds', () => {
    // `exchangeAssetsByChain('solana:devnet')` is ["SOL_DEVNET","USDC_SOL"], so
    // "Sell USDC" is wrong for a SOL holder. Spec-correction #37, which #18
    // already applied to the exchange title.
    const { container } = render(<WalletActions />)
    expect(container.textContent).not.toMatch(/USDC|SOL\b|ETH\b/)
  })

  it('has NO Buy affordance — not a link, not a disabled button, not the word', () => {
    const { container } = render(<WalletActions />)
    expect(container.textContent).not.toMatch(/\bbuy\b/i)
    expect(screen.queryByRole('button')).toBeNull()
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toMatch(/side=buy|onramp/)
    }
  })
})
