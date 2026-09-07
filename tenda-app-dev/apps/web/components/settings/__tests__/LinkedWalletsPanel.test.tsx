/**
 * Linked-wallets panel: list + primary badge, add (link) success/decline,
 * set-primary, and the unlink confirm flow with the server-guard copy
 * (WALLET_IS_PRIMARY / WALLET_IN_USE) — the server enforces, we translate.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiClientError, WalletError, type LinkedWallet } from '@tenda/shared'

const WALLETS: LinkedWallet[] = [
  { chain_ns: 'solana', address: 'SoLPrimary1111', is_primary: true, verified_at: 'now' },
  { chain_ns: 'eip155', address: '0xSecondary22', is_primary: false, verified_at: 'now' },
]

const store = {
  wallets: WALLETS,
  walletsStatus: 'ready' as string,
  refreshWallets: vi.fn(async () => {}),
  linkWallet: vi.fn(),
}
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (sel: (s: typeof store) => unknown) => sel(store),
}))
vi.mock('@/wallet/adapters/reown', () => ({ reownAdapter: { id: 'reown' } }))

const mockUnlink = vi.fn()
const mockSetPrimary = vi.fn()
vi.mock('@/api/client', () => ({
  api: {
    auth: {
      unlinkWallet: (b: unknown) => mockUnlink(b),
      setPrimaryWallet: (b: unknown) => mockSetPrimary(b),
    },
  },
}))

import { LinkedWalletsPanel } from '@/components/settings/LinkedWalletsPanel'

beforeEach(() => {
  store.wallets = WALLETS
  store.walletsStatus = 'ready'
})

describe('why-link explainer', () => {
  it('states WHY a wallet is needed, verbatim from the shared support intro', async () => {
    // Asserted against the imported constants, not copied strings: a local
    // restatement drifting from the support guide is the failure mode.
    const { SUPPORT_WALLET_INTRO } = await import('@tenda/shared')
    render(<LinkedWalletsPanel />)
    expect(screen.getByText(SUPPORT_WALLET_INTRO.label)).toBeInTheDocument()
    expect(screen.getByText(SUPPORT_WALLET_INTRO.body)).toBeInTheDocument()
  })

  it('links to the shared wallet guide by its own title and slug', async () => {
    const { SUPPORT_TOPICS } = await import('@tenda/shared')
    const topic = SUPPORT_TOPICS.find((t) => t.slug === 'wallet')
    expect(topic).toBeDefined()
    render(<LinkedWalletsPanel />)
    expect(
      screen.getByRole('link', { name: `${topic?.title} guide` }),
    ).toHaveAttribute('href', '/support/wallet')
  })
})

describe('list', () => {
  it('renders each wallet with truncated address, namespace and primary badge', () => {
    render(<LinkedWalletsPanel />)
    expect(screen.getByText('Primary')).toBeInTheDocument()
    expect(screen.getByText('Solana')).toBeInTheDocument()
    expect(screen.getByText('EVM')).toBeInTheDocument()
    // truncated, not full addresses
    expect(screen.queryByText('SoLPrimary1111')).toBeNull()
    // refresh on mount
    expect(store.refreshWallets).toHaveBeenCalled()
  })

  it('offers a retry when loading failed', async () => {
    store.wallets = []
    store.walletsStatus = 'error'
    render(<LinkedWalletsPanel />)
    expect(screen.getByText('Could not load your wallets.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(store.refreshWallets.mock.calls.length).toBeGreaterThan(1)
  })
})

describe('add wallet', () => {
  it('links via the adapter and confirms', async () => {
    store.linkWallet.mockResolvedValue(true)
    render(<LinkedWalletsPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Add another wallet' }))
    expect(await screen.findByText('Wallet linked')).toBeInTheDocument()
  })

  it('a closed wallet prompt reads as exactly that', async () => {
    store.linkWallet.mockResolvedValue(false)
    render(<LinkedWalletsPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Add another wallet' }))
    expect(await screen.findByText('Wallet prompt was closed')).toBeInTheDocument()
  })

  it('surfaces the server message on a link collision', async () => {
    store.linkWallet.mockRejectedValue(
      new ApiClientError(409, 'Conflict', 'This wallet is already linked to another account'),
    )
    render(<LinkedWalletsPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Add another wallet' }))
    expect(await screen.findByText('This wallet is already linked to another account')).toBeInTheDocument()
  })
})

describe('set primary + unlink', () => {
  it('promotes a non-primary wallet', async () => {
    mockSetPrimary.mockResolvedValue({ ok: true })
    render(<LinkedWalletsPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Make primary' }))
    expect(mockSetPrimary).toHaveBeenCalledWith({ chain_ns: 'eip155', address: '0xSecondary22' })
    expect(await screen.findByText('Primary wallet updated')).toBeInTheDocument()
  })

  it('unlink asks for confirmation first, then calls the API', async () => {
    mockUnlink.mockResolvedValue({ ok: true })
    render(<LinkedWalletsPanel />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Unlink' })[1]!)
    // dialog appears; nothing sent yet
    expect(mockUnlink).not.toHaveBeenCalled()
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Unlink' }))
    await waitFor(() =>
      expect(mockUnlink).toHaveBeenCalledWith({ chain_ns: 'eip155', address: '0xSecondary22' }),
    )
    expect(await screen.findByText('Wallet unlinked')).toBeInTheDocument()
  })

  it('translates the WALLET_IS_PRIMARY and WALLET_IN_USE guards', async () => {
    mockUnlink.mockRejectedValueOnce(
      new ApiClientError(409, 'Conflict', 'primary', 'WALLET_IS_PRIMARY'),
    )
    render(<LinkedWalletsPanel />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Unlink' })[0]!)
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Unlink' }))
    expect(
      await screen.findByText('Make another wallet your primary first, then unlink this one'),
    ).toBeInTheDocument()
  })

  it('translates WALLET_IN_USE, and a plain failure gets the generic copy', async () => {
    mockUnlink.mockRejectedValueOnce(new ApiClientError(409, 'Conflict', 'in use', 'WALLET_IN_USE'))
    render(<LinkedWalletsPanel />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Unlink' })[0]!)
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Unlink' }))
    expect(
      await screen.findByText('This wallet is part of an active escrow, finish or cancel it first'),
    ).toBeInTheDocument()

    mockUnlink.mockRejectedValueOnce(new Error('boom'))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Unlink' }))
    expect(await screen.findByText('Could not unlink the wallet')).toBeInTheDocument()
  })

  it('a failed set-primary shows the generic copy when the error is not typed', async () => {
    mockSetPrimary.mockRejectedValueOnce(new Error('down'))
    render(<LinkedWalletsPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Make primary' }))
    expect(await screen.findByText('Could not update the primary wallet')).toBeInTheDocument()
  })

  it('an empty ready list invites the first link', () => {
    store.wallets = []
    store.walletsStatus = 'ready'
    render(<LinkedWalletsPanel />)
    expect(screen.getByText(/No wallets linked yet/)).toBeInTheDocument()
  })

  it('a generic link failure gets the generic copy', async () => {
    store.linkWallet.mockRejectedValueOnce(new Error('boom'))
    render(<LinkedWalletsPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Add another wallet' }))
    expect(await screen.findByText('Could not link the wallet, please try again')).toBeInTheDocument()
  })

  it('an unconfigured build (WalletError no_wallet) reads as exactly that, not a generic error', async () => {
    store.linkWallet.mockRejectedValueOnce(new WalletError('no_wallet', 'unconfigured'))
    render(<LinkedWalletsPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Add another wallet' }))
    expect(await screen.findByText(/not configured for this build/)).toBeInTheDocument()
  })

  it('cancel closes the dialog without any API call', async () => {
    render(<LinkedWalletsPanel />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Unlink' })[0]!)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(mockUnlink).not.toHaveBeenCalled()
  })
})
