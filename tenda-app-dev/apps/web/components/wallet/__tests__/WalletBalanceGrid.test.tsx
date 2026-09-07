/**
 * The per-chain balance cards.
 *
 * The load-bearing assertion is the DASH: a chain whose balance could not be
 * read must not render `0.00`. "You hold nothing here" and "we could not read
 * this" are different facts, and the second dressed as the first is the wallet
 * bug `resolveWalletSection` exists to prevent at the section level — this is
 * the same rule one level down.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { WalletChainBalance } from '@tenda/shared'
import { WalletBalanceGrid } from '@/components/wallet/WalletBalanceGrid'
import { WALLET_COPY } from '@/components/wallet/copy'

const ROW: WalletChainBalance = {
  chainId: 'solana:devnet',
  namespace: 'solana',
  displayName: 'Solana Devnet',
  address: 'SoLAddr11111111111111111111111111111111111',
  usdc: { assetId: 'USDC_SOL', symbol: 'USDC', amountRaw: '48500000', decimals: 6, isStable: true },
  native: { assetId: 'SOL_DEVNET', symbol: 'SOL', amountRaw: '1200000000', decimals: 9, isStable: false },
}

describe('WalletBalanceGrid', () => {
  it('names the chain and shows the figure and its ticker apart, as the comp sets them', () => {
    render(<WalletBalanceGrid balances={[ROW]} />)
    expect(screen.getByText('Solana Devnet')).toBeInTheDocument()
    // Separate elements at different sizes — asserted separately for that reason.
    expect(screen.getByText('48.5')).toBeInTheDocument()
    expect(screen.getByText('USDC')).toBeInTheDocument()
  })

  it('truncates the address and never prints it in full', () => {
    const { container } = render(<WalletBalanceGrid balances={[ROW]} />)
    expect(container.textContent).toContain('SoLA…1111')
    expect(container.textContent).not.toContain(ROW.address)
  })

  it('carries the native balance in the note beside the address', () => {
    const { container } = render(<WalletBalanceGrid balances={[ROW]} />)
    expect(container.textContent).toContain('1.2 SOL')
  })

  it('shows a DASH, never a zero, for a balance it could not read', () => {
    const { container } = render(
      <WalletBalanceGrid balances={[{ ...ROW, usdc: null, native: null }]} />,
    )
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(container.textContent).not.toContain('0.00')
    // And it SAYS the native reading is missing rather than omitting it
    // silently, which would read as "this chain has no native token".
    expect(container.textContent).toContain(WALLET_COPY.noNative)
  })

  it('an 18-decimal balance shows a rounded figure, never a float tail (#50)', () => {
    // 1.234567890123456789 cUSD. The grid used to ask toLocaleString for
    // `decimals` fraction digits off a float, which is more precision than a
    // double carries: it rendered "1.2345678901234567" — six trailing digits
    // of arithmetic noise, presented to the reader as their balance.
    const cusd: WalletChainBalance = {
      chainId: 'eip155:42220',
      namespace: 'eip155',
      displayName: 'Celo',
      address: '0xAbCdEf0000000000000000000000000000001234',
      usdc: {
        assetId: 'cUSD',
        symbol: 'cUSD',
        amountRaw: '1234567890123456789',
        decimals: 18,
        isStable: true,
      },
      native: null,
    }
    const { container } = render(<WalletBalanceGrid balances={[cusd]} />)
    expect(screen.getByText('1.2346')).toBeInTheDocument()
    expect(container.textContent).not.toContain('1.2345678901234567')
  })

  it('renders nothing at all when there are no chains', () => {
    const { container } = render(<WalletBalanceGrid balances={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
