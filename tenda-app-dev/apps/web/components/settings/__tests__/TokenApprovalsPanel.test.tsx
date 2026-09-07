/**
 * TokenApprovalsPanel — port of mobile's token-approvals screen suite: rows
 * from the EVM registry, the custom-limit dialog (parse via the REAL shared
 * helper, approve through the connected-session seam), revoke-with-confirm,
 * cancel never sending, and the unreadable-allowance honesty ('Unavailable',
 * never zero).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { ChainRegistryEntry } from '@tenda/shared'

const { readAllowanceMock, sendApproveMock, waitForReceiptMock, showToastMock, resolveEvmFromMock, registryState } = vi.hoisted(() => ({
  readAllowanceMock: vi.fn(),
  sendApproveMock: vi.fn(),
  waitForReceiptMock: vi.fn(),
  showToastMock: vi.fn(),
  resolveEvmFromMock: vi.fn(),
  registryState: { chains: null as ChainRegistryEntry[] | null, fetch: vi.fn(async () => {}) },
}))

// Partial: the pure displayToAmountRaw stays REAL — parsing is under test.
vi.mock('@tenda/shared', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@tenda/shared')),
  readAllowance: (...a: unknown[]) => readAllowanceMock(...a),
  sendApprove: (...a: unknown[]) => sendApproveMock(...a),
  waitForReceipt: (...a: unknown[]) => waitForReceiptMock(...a),
}))
vi.mock('@/components/ui/Toast', () => ({ showToast: (...a: unknown[]) => showToastMock(...a) }))
vi.mock('@/wallet/dispatch', () => ({ resolveEvmFrom: () => resolveEvmFromMock() }))
vi.mock('@/wallet/send/evm', () => ({ sendEvmTransaction: vi.fn() }))
vi.mock('@/stores/chain-registry.store', () => ({
  useChainRegistryStore: Object.assign(
    (selector: (s: typeof registryState) => unknown) => selector(registryState),
    { getState: () => registryState },
  ),
}))

import { TokenApprovalsPanel } from '@/components/settings/TokenApprovalsPanel'

const OWNER = '0xOwner'
const EVM_CHAIN: ChainRegistryEntry = {
  id: 'eip155:84532',
  namespace: 'eip155',
  display_name: 'Base Sepolia',
  escrow_address: '0xEscrow',
  assets: [
    { id: 'USDC_BASE', symbol: 'USDC', decimals: 6, is_stable: true, token_address: '0xUSDC', supports_permit: true },
  ],
}
const SOL_CHAIN: ChainRegistryEntry = {
  id: 'solana:devnet',
  namespace: 'solana',
  display_name: 'Solana',
  escrow_address: 'PROG',
  assets: [
    { id: 'USDC_SOL', symbol: 'USDC', decimals: 6, is_stable: true, token_address: 'MINT', supports_permit: false },
  ],
}

beforeEach(() => {
  registryState.chains = [EVM_CHAIN, SOL_CHAIN]
  resolveEvmFromMock.mockReturnValue(OWNER)
  readAllowanceMock.mockResolvedValue('45000000')
  sendApproveMock.mockResolvedValue('0xTxHash')
  waitForReceiptMock.mockResolvedValue('confirmed')
})

test('lists one row per EVM token with the read allowance (Solana never appears)', async () => {
  render(<TokenApprovalsPanel />)
  await waitFor(() => expect(screen.getByText('45 USDC')).toBeInTheDocument())
  expect(screen.getByText('USDC · Base Sepolia')).toBeInTheDocument()
  expect(screen.queryByText(/Solana/)).not.toBeInTheDocument()
  expect(readAllowanceMock).toHaveBeenCalledWith({
    chainId: 'eip155:84532',
    token: '0xUSDC',
    owner: OWNER,
    spender: '0xEscrow',
  })
})

test('a failed read shows Unavailable — an unreadable allowance is never zero', async () => {
  readAllowanceMock.mockRejectedValue(new Error('rpc down'))
  render(<TokenApprovalsPanel />)
  await waitFor(() => expect(screen.getByText('Unavailable')).toBeInTheDocument())
  expect(screen.queryByText('No standing approval')).not.toBeInTheDocument()
})

test('no linked EVM wallet explains instead of reading', async () => {
  resolveEvmFromMock.mockReturnValue(null)
  render(<TokenApprovalsPanel />)
  expect(screen.getByText(/Link an EVM wallet/)).toBeInTheDocument()
  expect(readAllowanceMock).not.toHaveBeenCalled()
})

test('setting a custom limit parses with the asset decimals and approves via the session seam', async () => {
  render(<TokenApprovalsPanel />)
  await waitFor(() => expect(screen.getByText('45 USDC')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Set' }))
  fireEvent.change(screen.getByLabelText('Amount in USDC'), { target: { value: '12.5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
  await waitFor(() =>
    expect(sendApproveMock).toHaveBeenCalledWith({
      chainId: 'eip155:84532',
      token: '0xUSDC',
      spender: '0xEscrow',
      amountRaw: '12500000',
      from: OWNER,
      sendTx: expect.any(Function),
    }),
  )
  await waitFor(() => expect(showToastMock).toHaveBeenCalledWith('success', 'Approval set to 12.5 USDC'))
})

test('an unparseable amount never touches the wallet', async () => {
  render(<TokenApprovalsPanel />)
  await waitFor(() => expect(screen.getByText('45 USDC')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Set' }))
  fireEvent.change(screen.getByLabelText('Amount in USDC'), { target: { value: 'abc' } })
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
  expect(showToastMock).toHaveBeenCalledWith('error', expect.stringMatching(/valid USDC amount/))
  expect(sendApproveMock).not.toHaveBeenCalled()
})

test('revoke confirms first, then approves 0', async () => {
  render(<TokenApprovalsPanel />)
  await waitFor(() => expect(screen.getByText('45 USDC')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
  const dialog = screen.getByRole('alertdialog', { name: 'Revoke approval?' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }))
  await waitFor(() =>
    expect(sendApproveMock).toHaveBeenCalledWith(expect.objectContaining({ amountRaw: '0', token: '0xUSDC' })),
  )
  await waitFor(() => expect(showToastMock).toHaveBeenCalledWith('success', 'Approval revoked'))
})

test('cancelling the revoke dialog never sends', async () => {
  render(<TokenApprovalsPanel />)
  await waitFor(() => expect(screen.getByText('45 USDC')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(sendApproveMock).not.toHaveBeenCalled()
})

test('a reverted approve surfaces as an error toast', async () => {
  waitForReceiptMock.mockResolvedValue('reverted')
  render(<TokenApprovalsPanel />)
  await waitFor(() => expect(screen.getByText('45 USDC')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
  const dialog = screen.getByRole('alertdialog', { name: 'Revoke approval?' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }))
  await waitFor(() =>
    expect(showToastMock).toHaveBeenCalledWith('error', 'The approval transaction reverted'),
  )
})

test('a zero allowance shows "No standing approval" and offers no Revoke', async () => {
  readAllowanceMock.mockResolvedValue('0')
  render(<TokenApprovalsPanel />)
  await waitFor(() => expect(screen.getByText('No standing approval')).toBeInTheDocument())
  expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument()
})

test('a max-uint style allowance reads as Unlimited', async () => {
  readAllowanceMock.mockResolvedValue((BigInt(2) ** BigInt(256) - BigInt(1)).toString())
  render(<TokenApprovalsPanel />)
  await waitFor(() => expect(screen.getByText('Unlimited USDC')).toBeInTheDocument())
})
