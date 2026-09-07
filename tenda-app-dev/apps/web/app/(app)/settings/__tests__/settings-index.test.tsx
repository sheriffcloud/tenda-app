/**
 * The settings index: the cards, the one preference that is actually
 * persisted, and the badge honesty rule.
 *
 * The comp draws three notification toggles (push, email, weekly digest).
 * None exist server-side, so none are built — the test below is what stops
 * one being added back without a contract behind it.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'

const { updateMeMock, refreshUserMock, ensureWalletsMock } = vi.hoisted(() => ({
  updateMeMock: vi.fn(),
  refreshUserMock: vi.fn(),
  ensureWalletsMock: vi.fn(),
}))

vi.mock('@/api/client', () => ({
  api: { users: { updateMe: (...a: unknown[]) => updateMeMock(...a) } },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))

import SettingsPage from '@/app/(app)/settings/page'
import type { User } from '@tenda/shared'
import { useAuthStore } from '@/stores/auth.store'

const WALLET = {
  chain_ns: 'solana' as const,
  address: 'SoL1',
  is_primary: true,
  verified_at: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  updateMeMock.mockReset().mockResolvedValue({})
  refreshUserMock.mockReset().mockResolvedValue(undefined)
  ensureWalletsMock.mockReset().mockResolvedValue(undefined)
  useAuthStore.setState({
    user: { advanced_mode_enabled: false } as User,
    wallets: [],
    walletsStatus: 'idle',
    ensureWallets: ensureWalletsMock,
    refreshUser: refreshUserMock,
  })
})

test('lists every settings surface, including the ones the comp does not draw', () => {
  render(<SettingsPage />)
  for (const name of [
    'Sign-in methods',
    'Linked wallets',
    'Bank accounts',
    'Token approvals',
    'Your profile',
  ]) {
    expect(screen.getByText(name)).toBeInTheDocument()
  }
  // Kept because mobile wins on which surfaces exist.
  expect(screen.getByRole('link', { name: /Help/ })).toHaveAttribute('href', '/support')
})

test('shows no wallet badge until the wallets have actually been read', () => {
  render(<SettingsPage />)
  // walletsStatus is 'idle': "0 linked" here would be a false statement.
  expect(screen.queryByText(/linked$/)).not.toBeInTheDocument()
})

test('shows the wallet count once the read has settled', () => {
  useAuthStore.setState({ wallets: [WALLET], walletsStatus: 'ready' })
  render(<SettingsPage />)
  expect(screen.getByText('1 linked')).toBeInTheDocument()
})

test('asks for the wallets so the badge can become true', () => {
  render(<SettingsPage />)
  expect(ensureWalletsMock).toHaveBeenCalled()
})

test('the P2P preference persists and re-reads the user', async () => {
  render(<SettingsPage />)
  await userEvent.click(screen.getByRole('switch', { name: 'P2P Exchange' }))
  await waitFor(() => expect(updateMeMock).toHaveBeenCalledWith({ advanced_mode_enabled: true }))
  // Re-read rather than assumed: the server owns the flag.
  expect(refreshUserMock).toHaveBeenCalled()
})

test('offers no notification toggles, because nothing would store them', () => {
  render(<SettingsPage />)
  const switches = screen.getAllByRole('switch')
  expect(switches).toHaveLength(1)
  for (const label of ['Push notifications', 'Email notifications', 'Weekly summary']) {
    expect(screen.queryByText(label)).not.toBeInTheDocument()
  }
})

test('carries sign-out, which the workspace rail does not', () => {
  render(<SettingsPage />)
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
})
