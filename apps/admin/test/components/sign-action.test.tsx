import { test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import type { ResolutionExecuteBuild, UnsignedTx } from '@tenda/shared'
import { SignAction } from '@/components/disputes/resolution/sign-action'
import { WalletSignerProvider } from '@/providers/wallet-signer'
import type { WalletSigner } from '@/lib/resolution-sign'
import { adminApi } from '@/api/client'

vi.mock('@/api/client', () => ({
  adminApi: { resolutions: { executeBuild: vi.fn(), broadcast: vi.fn() } },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const executeBuild = vi.mocked(adminApi.resolutions.executeBuild)
const broadcast = vi.mocked(adminApi.resolutions.broadcast)

const CHAIN = 'eip155:84532'
const AUTH = '0xAbC0000000000000000000000000000000000001'
const UNSIGNED: UnsignedTx = { kind: 'evm-tx', to: '0x1', data: '0x2', value: '0' }

const buildResp: ResolutionExecuteBuild = {
  resolution_id: 'r1', escrow_id: 'e1', chain_id: CHAIN,
  proposed_winner: 'creator', dispute_admin_authority: AUTH, unsigned: UNSIGNED,
}

function makeSigner(connected: string | null, over: Partial<WalletSigner> = {}): WalletSigner {
  return {
    getConnected: vi.fn().mockReturnValue(connected),
    subscribe: vi.fn().mockReturnValue(() => {}),
    open: vi.fn().mockResolvedValue(undefined),
    signAndBroadcast: vi.fn().mockResolvedValue('0xtxhash'),
    ...over,
  }
}

function renderWithSigner(
  signer: WalletSigner | null,
  { authority = AUTH, onSigned = vi.fn() }: { authority?: string | null; onSigned?: () => void } = {},
) {
  return {
    onSigned,
    ...render(
      <WalletSignerProvider signer={signer}>
        <SignAction resolutionId="r1" chainId={CHAIN} authority={authority} onSigned={onSigned} />
      </WalletSignerProvider>,
    ),
  }
}

beforeEach(() => vi.clearAllMocks())

test('no signer configured: shows the notice, no buttons', () => {
  renderWithSigner(null)
  expect(screen.getByText(/isn’t configured on this deployment/)).toBeInTheDocument()
  expect(screen.queryByRole('button')).toBeNull()
})

test('no wallet connected: shows Connect wallet, which opens the modal', async () => {
  const signer = makeSigner(null)
  renderWithSigner(signer)
  const btn = screen.getByRole('button', { name: 'Connect wallet' })
  await userEvent.click(btn)
  expect(signer.open).toHaveBeenCalledWith(CHAIN)
  expect(screen.queryByRole('button', { name: 'Sign & resolve' })).toBeNull()
})

test('wrong wallet connected: Sign is disabled with a switch hint', () => {
  const signer = makeSigner('0xDEAD000000000000000000000000000000000000')
  renderWithSigner(signer)
  expect(screen.getByText(/Switch to the dispute-authority wallet/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign & resolve' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Switch wallet' })).toBeEnabled()
})

test('authority wallet connected (case-insensitive EVM): Sign enabled, runs the full flow', async () => {
  executeBuild.mockResolvedValue(buildResp)
  broadcast.mockResolvedValue({ status: 'queued' })
  const signer = makeSigner(AUTH.toLowerCase())
  const { onSigned } = renderWithSigner(signer)
  const sign = screen.getByRole('button', { name: 'Sign & resolve' })
  expect(sign).toBeEnabled()
  await userEvent.click(sign)
  await waitFor(() => expect(broadcast).toHaveBeenCalledWith('r1', '0xtxhash'))
  expect(signer.signAndBroadcast).toHaveBeenCalledWith(CHAIN, UNSIGNED)
  expect(toast.success).toHaveBeenCalled()
  expect(onSigned).toHaveBeenCalled()
})

test('no configured authority: match gate is skipped, Sign enabled', () => {
  const signer = makeSigner('0xanything00000000000000000000000000000000')
  renderWithSigner(signer, { authority: null })
  expect(screen.queryByText(/Switch to the dispute-authority wallet/)).toBeNull()
  expect(screen.getByRole('button', { name: 'Sign & resolve' })).toBeEnabled()
})

test('Switch wallet opens the modal without signing', async () => {
  const signer = makeSigner('0xDEAD000000000000000000000000000000000000')
  renderWithSigner(signer)
  await userEvent.click(screen.getByRole('button', { name: 'Switch wallet' }))
  expect(signer.open).toHaveBeenCalledWith(CHAIN)
  expect(executeBuild).not.toHaveBeenCalled()
})
