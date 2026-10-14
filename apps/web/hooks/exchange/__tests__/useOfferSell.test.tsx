/**
 * The offer-creation orchestration: draft → terms → sign in ORDER with
 * one idempotent operation id; a terms failure DISCARDS the bare draft; a
 * signing decline leaves the draft alive and routes to its page.
 */
import { renderHook, act } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { ApiClientError, TRANSACTION_GATE_MESSAGE, type BankAccountSummary } from '@tenda/shared'

const routerReplace = vi.hoisted(() => vi.fn())
const routerPush = vi.hoisted(() => vi.fn())
const apiMock = vi.hoisted(() => ({
  escrows: {
    create: vi.fn<() => Promise<{ escrow_id: string; unsigned: { kind: string } }>>(),
    delete: vi.fn<() => Promise<{ deleted: true }>>(),
  },
  exchange: { create: vi.fn<() => Promise<{ escrow_id: string }>>() },
}))
const signSendAndReport = vi.hoisted(() => vi.fn<() => Promise<void>>())
const ensureSufficientBalance = vi.hoisted(() => vi.fn<() => Promise<void>>())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, push: routerPush, back: vi.fn() }),
}))
vi.mock('@/api/client', () => ({ api: apiMock }))
const ensureTxPreconditions = vi.hoisted(() => vi.fn<() => Promise<void>>())
vi.mock('@/wallet/dispatch', () => ({
  resolveSignersForChain: () => ['SoLAddr1'],
  declaredSignerFor: () => 'SoLAddr1',
  ensureTxPreconditions,
  signSendAndReport,
}))
vi.mock('@/wallet/balances', () => ({ ensureSufficientBalance }))
// The wallet gate refreshes wallets[] instead of navigating (#60), so the
// store is a real dependency of this hook now.
const refreshWallets = vi.hoisted(() => vi.fn<() => Promise<void>>())
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: { getState: () => ({ refreshWallets }) },
}))
const toastMock = vi.hoisted(() => vi.fn())
vi.mock('@/components/ui/Toast', () => ({ showToast: toastMock }))

import { useOfferSell, type OfferSubmitArgs } from '@/hooks/exchange/useOfferSell'

const ACCOUNT: BankAccountSummary = {
  id: 'acct-1',
  country: 'NG',
  kind: 'bank',
  bank_code: '058',
  account_number_masked: '******6789',
  account_name: 'Ada Okafor',
  is_default: true,
  verified: true,
  created_at: '2026-08-01T00:00:00.000Z',
}

const ARGS: OfferSubmitArgs = {
  option: {
    chainId: 'solana:devnet',
    assetId: 'USDC_SOL',
    symbol: 'USDC',
    decimals: 6,
    chainName: 'Solana Devnet',
    walletAddress: 'SoLAddr1',
  },
  amountRaw: '50000000',
  account: ACCOUNT,
  fiatTotal: 75000,
  currency: 'NGN',
  rate: 1500,
  acceptHours: 24,
  paymentWindowSeconds: 3600,
}

beforeEach(() => {
  vi.clearAllMocks()
  ensureTxPreconditions.mockResolvedValue()
  ensureSufficientBalance.mockResolvedValue()
  apiMock.escrows.create.mockResolvedValue({ escrow_id: 'new-exch', unsigned: { kind: 'solana-tx' } })
  apiMock.exchange.create.mockResolvedValue({ escrow_id: 'new-exch' })
  apiMock.escrows.delete.mockResolvedValue({ deleted: true })
  signSendAndReport.mockResolvedValue()
  refreshWallets.mockResolvedValue()
})

test('the wallet gate KEEPS the composition — it no longer navigates away (#60)', async () => {
  // Routing to Settings here took the whole offer with it: asset, amount,
  // rate, payout account. The precondition notice above the picker is the way
  // out, and refreshing wallets[] is what makes it appear — the server has
  // just contradicted this client, so the list it believed is the stale thing.
  apiMock.escrows.create.mockRejectedValue(
    new ApiClientError(403, 'Forbidden', 'no wallet on this chain', 'WALLET_REQUIRED'),
  )
  const { result } = renderHook(() => useOfferSell())
  await act(async () => { await result.current.submit(ARGS) })

  expect(toastMock).toHaveBeenCalledWith('error', TRANSACTION_GATE_MESSAGE.wallet_required)
  expect(routerPush).not.toHaveBeenCalled()
  expect(routerReplace).not.toHaveBeenCalled()
  expect(refreshWallets).toHaveBeenCalledTimes(1)
  // Nothing reached the server, so there is no draft to land on either.
  expect(apiMock.exchange.create).not.toHaveBeenCalled()
  expect(result.current.submitting).toBe(false)
})

test('the CONTACT gate still routes — it is not a precondition this surface states', async () => {
  apiMock.escrows.create.mockRejectedValue(
    new ApiClientError(403, 'Forbidden', 'no verified contact', 'CONTACT_REQUIRED'),
  )
  const { result } = renderHook(() => useOfferSell())
  await act(async () => { await result.current.submit(ARGS) })

  expect(toastMock).toHaveBeenCalledWith('error', TRANSACTION_GATE_MESSAGE.contact_required)
  expect(routerPush).toHaveBeenCalledWith('/settings/security')
  expect(refreshWallets).not.toHaveBeenCalled()
})

test('happy path: balance gate → draft → terms → sign, then lands on the offer', async () => {
  const { result } = renderHook(() => useOfferSell())
  await act(() => result.current.submit(ARGS))

  expect(ensureSufficientBalance).toHaveBeenCalledWith(
    expect.objectContaining({ chainId: 'solana:devnet', amountRaw: '50000000' }),
  )
  expect(apiMock.escrows.create).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'exchange',
      completion_duration_seconds: 3600, // the ONE payment-window semantic
    }),
  )
  expect(apiMock.exchange.create).toHaveBeenCalledWith(
    expect.objectContaining({
      escrow_id: 'new-exch',
      payment_window_seconds: 3600,
      payout_account_id: 'acct-1',
    }),
  )
  expect(signSendAndReport).toHaveBeenCalledWith(expect.objectContaining({ action: 'create' }))
  expect(routerReplace).toHaveBeenCalledWith('/exchange/new-exch')
})

test('a terms failure DISCARDS the bare draft (never an unfundable orphan)', async () => {
  apiMock.exchange.create.mockRejectedValue(new Error('bad terms'))
  const { result } = renderHook(() => useOfferSell())
  await act(() => result.current.submit(ARGS))

  expect(apiMock.escrows.delete).toHaveBeenCalledWith({ id: 'new-exch' })
  expect(signSendAndReport).not.toHaveBeenCalled()
  expect(routerReplace).not.toHaveBeenCalled()
})

test('a signing decline leaves the draft alive and routes to its page', async () => {
  signSendAndReport.mockRejectedValue(new Error('user declined'))
  const { result } = renderHook(() => useOfferSell())
  await act(() => result.current.submit(ARGS))

  expect(apiMock.escrows.delete).not.toHaveBeenCalled() // draft survives
  // Mobile-aligned copy: an INFO toast carrying the wallet's own message.
  expect(toastMock).toHaveBeenCalledWith('info', 'user declined')
  expect(routerReplace).toHaveBeenCalledWith('/exchange/new-exch')
})

test('concurrent submits collapse to ONE order (double-click ≠ two drafts)', async () => {
  const { result } = renderHook(() => useOfferSell())
  await act(async () => {
    // Fire the second submit while the first is still in flight.
    await Promise.all([result.current.submit(ARGS), result.current.submit(ARGS)])
  })
  expect(apiMock.escrows.create).toHaveBeenCalledTimes(1)
  expect(signSendAndReport).toHaveBeenCalledTimes(1)
  expect(result.current.submitting).toBe(false) // and the flag resets after
})

test('the trust list + registry load BEFORE the balance gate and the signer declaration', async () => {
  // Without this, a cold wallets store makes resolveSignersForChain answer []
  // (balance gate silently inert) AND declaredSignerFor declare nothing (the
  // Solana create bakes the primary guess) — the sibling flows document the
  // same rule; this pins offer-sell to it.
  const { result } = renderHook(() => useOfferSell())
  await act(() => result.current.submit(ARGS))
  expect(ensureTxPreconditions).toHaveBeenCalledTimes(1)
  expect(ensureTxPreconditions.mock.invocationCallOrder[0]).toBeLessThan(
    ensureSufficientBalance.mock.invocationCallOrder[0],
  )
})

test('an insufficient balance stops before any server write', async () => {
  const { InsufficientBalanceError } = await import('@tenda/shared')
  ensureSufficientBalance.mockRejectedValue(new InsufficientBalanceError('USDC_SOL', '50000000', '1000000'))
  const { result } = renderHook(() => useOfferSell())
  await act(() => result.current.submit(ARGS))

  expect(apiMock.escrows.create).not.toHaveBeenCalled()
})
