/**
 * TxConfirmDialog — the pre-sign gate over the SHARED copy table (never
 * mocked: the dialog's visibility contract IS txConfirmCopy returning null
 * for ungated actions).
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WALLET_OPEN_NOTE } from '@tenda/shared'

vi.mock('@/components/wallet/SigningWalletRow', () => ({
  SigningWalletRow: ({
    chainId,
    spend,
    bound,
  }: {
    chainId: string
    spend?: { assetId: string; amountRaw: string }
    bound?: string | null
  }) => (
    <div data-testid="signer-row">
      {chainId}
      {spend !== undefined ? ` spends ${spend.amountRaw} ${spend.assetId}` : ''}
      {bound !== undefined && bound !== null ? ` bound ${bound}` : ''}
    </div>
  ),
}))

import { TxConfirmDialog } from '@/components/escrow/TxConfirmDialog'

const CTX = { amount: '50 USDC', kind: 'gig' as const }
const noop = () => {}

describe('visibility', () => {
  it('renders nothing for a null action', () => {
    const { container } = render(
      <TxConfirmDialog action={null} ctx={CTX} onConfirm={noop} onCancel={noop} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for an ungated action (submit collects input in its own sheet)', () => {
    const { container } = render(
      <TxConfirmDialog action="submit" ctx={CTX} onConfirm={noop} onCancel={noop} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('gated copy', () => {
  it('create (gig) shows the fund copy, the amount, and the wallet note', () => {
    const { container } = render(
      <TxConfirmDialog action="create" ctx={CTX} onConfirm={noop} onCancel={noop} />,
    )
    expect(screen.getByText('Fund this gig?')).toBeInTheDocument()
    expect(screen.getByText(/locks 50 USDC in escrow/)).toBeInTheDocument()
    // The note is appended to the body inside the same paragraph.
    expect(container.textContent).toContain(WALLET_OPEN_NOTE)
    expect(screen.getByRole('button', { name: 'Fund Gig' })).toBeInTheDocument()
  })

  it('a chainId mounts the signer row on the escrow chain', () => {
    render(
      <TxConfirmDialog action="create" ctx={CTX} chainId="eip155:84532" onConfirm={noop} onCancel={noop} />,
    )
    expect(screen.getByTestId('signer-row')).toHaveTextContent('eip155:84532')
  })

  it('a spend rides through to the signer row (the balance warning input)', () => {
    render(
      <TxConfirmDialog
        action="create"
        ctx={CTX}
        chainId="eip155:84532"
        spend={{ assetId: 'USDC_BASE', amountRaw: '50000000' }}
        onConfirm={noop}
        onCancel={noop}
      />,
    )
    expect(screen.getByTestId('signer-row')).toHaveTextContent('spends 50000000 USDC_BASE')
  })

  it('without a spend the row gets none (no balance read for value-neutral actions)', () => {
    render(
      <TxConfirmDialog action="approve" ctx={CTX} chainId="eip155:84532" onConfirm={noop} onCancel={noop} />,
    )
    expect(screen.getByTestId('signer-row')).not.toHaveTextContent('spends')
  })

  it('without a chainId there is no signer row', () => {
    render(<TxConfirmDialog action="approve" ctx={CTX} onConfirm={noop} onCancel={noop} />)
    expect(screen.queryByTestId('signer-row')).toBeNull()
  })

  it('exchange kind swaps the wording', () => {
    render(
      <TxConfirmDialog action="create" ctx={{ ...CTX, kind: 'exchange' }} onConfirm={noop} onCancel={noop} />,
    )
    expect(screen.getByText('Publish this offer?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish Offer' })).toBeInTheDocument()
  })

  it('confirm and cancel wire through', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<TxConfirmDialog action="approve" ctx={CTX} onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve & Pay' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('loading locks both buttons (ConfirmDialog busy semantics)', () => {
    const onCancel = vi.fn()
    render(<TxConfirmDialog action="approve" ctx={CTX} loading onConfirm={noop} onCancel={onCancel} />)
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('net-of-fee honesty rides through to the rendered body', () => {
    render(
      <TxConfirmDialog
        action="approve"
        ctx={{ ...CTX, netAmount: '49.5 USDC', feePct: '1.00' }}
        onConfirm={noop}
        onCancel={noop}
      />,
    )
    expect(screen.getByText(/receives 49\.5 USDC after the 1\.00% platform fee/)).toBeInTheDocument()
  })
})

describe('bound signer passthrough', () => {
  it('the detail wire\'s my_signer_address reaches the row as the binding', () => {
    render(
      <TxConfirmDialog
        action="approve"
        ctx={CTX}
        chainId="eip155:84532"
        boundSigner="0xBound"
        onConfirm={noop}
        onCancel={noop}
      />,
    )
    expect(screen.getByTestId('signer-row')).toHaveTextContent('bound 0xBound')
  })

  it('a null binding (nothing recorded) leaves the row free', () => {
    render(
      <TxConfirmDialog
        action="approve"
        ctx={CTX}
        chainId="eip155:84532"
        boundSigner={null}
        onConfirm={noop}
        onCancel={noop}
      />,
    )
    expect(screen.getByTestId('signer-row')).not.toHaveTextContent('bound')
  })
})
