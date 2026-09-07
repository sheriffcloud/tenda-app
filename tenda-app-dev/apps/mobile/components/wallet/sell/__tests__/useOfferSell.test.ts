/**
 * useOfferSell — posting a P2P sell offer. Verifies the caller-chosen windows
 * thread through (accept → deadline unix, payment window → BOTH the escrow
 * completion duration and the offer payment_window), plus the negative paths:
 * draft cleanup on terms failure, and signing-declined → draft.
 *
 * The 9D transaction gate lives in the .gate. sibling since #60: its two
 * halves answer differently now (the wallet gate stays put, the contact gate
 * routes), and that needs the auth store this file does not mock.
 */
import { renderHook, act } from '@testing-library/react-native'
import type { BankAccountSummary } from '@tenda/shared'
import type { ExchangeAssetOption } from '@/hooks/useExchangeAssetOptions'

const NOW_MS = 1_700_000_000_000
const NOW_S = Math.floor(NOW_MS / 1000)

const mockCreate = jest.fn()
const mockDelete = jest.fn().mockResolvedValue(undefined)
const mockExchangeCreate = jest.fn()
const mockSign = jest.fn().mockResolvedValue('tx-ref')
const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockToast = jest.fn()

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: mockPush }) }))
jest.mock('@/api/client', () => ({
  api: {
    escrows: { create: (b: unknown) => mockCreate(b), delete: (b: unknown) => mockDelete(b) },
    exchange: { create: (b: unknown) => mockExchangeCreate(b) },
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(_status: number, _error: string, message: string) { super(message) }
  },
}))
jest.mock('@/components/ui', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }))
const mockSettleSignerFor: jest.Mock<Promise<void>, [string]> = jest.fn()
const mockDeclaredSignerFor: jest.Mock<string | undefined, [string]> = jest.fn()
jest.mock('@/wallet/dispatch', () => ({
  // The signer declaration: settled (a no-op off EVM) then read.
  settleSignerFor: (chainId: string) => mockSettleSignerFor(chainId),
  declaredSignerFor: (chainId: string) => mockDeclaredSignerFor(chainId),
  signSendAndReport: (a: unknown) => mockSign(a),
  resolveSignersForChain: () => mockSigners,
}))

// The balances barrel registers the Solana reader, which pulls @solana/web3.js
// (ESM) into Jest. Stub it — sufficiency has its own suite. The error class is
// real here because useOfferSell branches on `instanceof`.
const mockEnsureSufficientBalance = jest.fn()
let mockSigners: string[] = ['0xEvm']
// The binding module only exports the pre-flight now; the error class is
// shared and stays REAL — useOfferSell narrows `instanceof` against it.
jest.mock('@/wallet/balances', () => ({
  ensureSufficientBalance: (...a: unknown[]) => mockEnsureSufficientBalance(...a),
}))
// Imports stay below mock declarations so their modules observe the test doubles.
// eslint-disable-next-line import/first
import { useOfferSell } from '../useOfferSell'
// eslint-disable-next-line import/first
import { ApiClientError, InsufficientBalanceError } from '@tenda/shared'

const OPTION = {
  chainId: 'eip155:84532', assetId: 'USDC_BASE', symbol: 'USDC', decimals: 6, chainName: 'Base', walletAddress: '0xEvm',
} as ExchangeAssetOption
const ACCOUNT = { id: 'acc1', country: 'NG' } as BankAccountSummary
const ARGS = {
  option: OPTION, amountRaw: '2500000', account: ACCOUNT, fiatTotal: 16000,
  currency: 'NGN', rate: 1600, acceptHours: 24, paymentWindowSeconds: 21600, // 6h
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW_MS)
  mockSigners = ['0xEvm']
  mockEnsureSufficientBalance.mockReset().mockResolvedValue(undefined)
  mockCreate.mockReset().mockResolvedValue({ escrow_id: 'e1', unsigned: { kind: 'evm-tx' } })
  mockExchangeCreate.mockReset().mockResolvedValue({})
  mockDelete.mockClear()
  mockSign.mockClear()
  mockReplace.mockReset()
  mockPush.mockReset()
  mockToast.mockReset()
  mockSettleSignerFor.mockReset().mockResolvedValue(undefined)
  mockDeclaredSignerFor.mockReset().mockReturnValue('DECLARED')
})
afterEach(() => jest.restoreAllMocks())

test('threads the chosen windows into escrow + offer creation and signs', async () => {
  const { result } = renderHook(() => useOfferSell())
  await act(async () => { await result.current.submit(ARGS) })

  expect(mockCreate).toHaveBeenCalledWith({
    creation_operation_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    kind: 'exchange', chain_id: 'eip155:84532', asset: 'USDC_BASE', amount_raw: '2500000',
    // A DURATION now (#41): the server anchors it at build time.
    accept_window_seconds: 24 * 3600,
    completion_duration_seconds: 21600,
    // The wallet the create BAKES, declared rather than left to the server's
    // primary-wallet default.
    signer_address: 'DECLARED',
  })
  expect(mockExchangeCreate).toHaveBeenCalledWith({
    escrow_id: 'e1', fiat_amount: 16000, fiat_currency: 'NGN', rate: 1600,
    payment_window_seconds: 21600, payout_account_id: 'acc1',
  })
  expect(mockSign).toHaveBeenCalled()
  expect(mockReplace).toHaveBeenCalledWith('/exchange/e1')
})

test('deduplicates same-frame submissions before React state updates', async () => {
  let finishBalanceCheck: (() => void) | undefined
  mockEnsureSufficientBalance.mockReturnValue(new Promise<void>((resolve) => { finishBalanceCheck = resolve }))
  const { result } = renderHook(() => useOfferSell())

  let firstSubmission: Promise<void> | undefined
  await act(async () => {
    firstSubmission = result.current.submit(ARGS)
    void result.current.submit(ARGS)
    await Promise.resolve()
  })
  expect(mockEnsureSufficientBalance).toHaveBeenCalledTimes(1)
  expect(mockCreate).not.toHaveBeenCalled()

  await act(async () => {
    finishBalanceCheck?.()
    await firstSubmission
  })
  expect(mockCreate).toHaveBeenCalledTimes(1)
})

test('discards the draft when attaching offer terms fails', async () => {
  mockExchangeCreate.mockRejectedValue(new Error('bad rate'))
  const { result } = renderHook(() => useOfferSell())
  await act(async () => { await result.current.submit(ARGS) })

  expect(mockDelete).toHaveBeenCalledWith({ id: 'e1' })
  expect(mockSign).not.toHaveBeenCalled()
  expect(mockToast).toHaveBeenCalledWith('error', expect.any(String))
})

test('surfaces the API error message when create fails ungated', async () => {
  mockCreate.mockRejectedValue(new ApiClientError(409, 'Conflict', 'offer limit reached'))
  const { result } = renderHook(() => useOfferSell())
  await act(async () => { await result.current.submit(ARGS) })
  expect(mockToast).toHaveBeenCalledWith('error', 'offer limit reached')
  expect(mockReplace).not.toHaveBeenCalled()
})

test('changing the accept window mints a NEW operation id', async () => {
  // #41 made the window a compared TERM on the server: the same operation id
  // with a different window is now a 409. That is only safe because the window
  // is part of this composer's terms fingerprint — drop it there and a seller
  // who changed their mind after an ambiguous response would resend the old id
  // with a new window and be refused with no way to clear it.
  // The FIRST submit must fail ambiguously, or the attempt is cleared on success
  // and the second id would be new whatever the fingerprint holds — the test
  // would then pass for a reason that has nothing to do with the window.
  mockCreate
    .mockRejectedValueOnce(new Error('request timed out'))
    .mockResolvedValueOnce({ escrow_id: 'e1', unsigned: { kind: 'evm-tx' } })
  const { result } = renderHook(() => useOfferSell())
  await act(async () => { await result.current.submit(ARGS) })
  await act(async () => { await result.current.submit({ ...ARGS, acceptHours: 48 }) })

  const first = mockCreate.mock.calls[0][0]
  const changed = mockCreate.mock.calls[1][0]
  expect(changed.accept_window_seconds).not.toBe(first.accept_window_seconds)
  expect(changed.creation_operation_id).not.toBe(first.creation_operation_id)
})

test('an ambiguous create failure retries with the same operation and deadline', async () => {
  mockCreate
    .mockRejectedValueOnce(new Error('request timed out'))
    .mockResolvedValueOnce({ escrow_id: 'e1', unsigned: { kind: 'evm-tx' } })
  const { result } = renderHook(() => useOfferSell())

  await act(async () => { await result.current.submit(ARGS) })
  await act(async () => { await result.current.submit(ARGS) })

  const first = mockCreate.mock.calls[0][0]
  const retry = mockCreate.mock.calls[1][0]
  expect(retry.creation_operation_id).toBe(first.creation_operation_id)
  // The window is a TERM, so an identical retry sends an identical one — and
  // there is no separately pinned instant left that could drift between them.
  expect(retry.accept_window_seconds).toBe(first.accept_window_seconds)
  expect(mockExchangeCreate).toHaveBeenCalledTimes(1)
})

test('keeps the draft when signing is declined after terms are saved', async () => {
  mockSign.mockRejectedValue(new Error('user declined'))
  const { result } = renderHook(() => useOfferSell())
  await act(async () => { await result.current.submit(ARGS) })

  expect(mockDelete).not.toHaveBeenCalled() // terms saved, draft survives
  expect(mockToast).toHaveBeenCalledWith('info', 'user declined')
  expect(mockReplace).toHaveBeenCalledWith('/exchange/e1')
})

// --- balance pre-flight -----------------------------------------------------

test('checks the sell amount against every candidate wallet before creating', async () => {
  const { result } = renderHook(() => useOfferSell())
  await act(async () => { await result.current.submit(ARGS) })

  expect(mockEnsureSufficientBalance).toHaveBeenCalledWith({
    chainId: 'eip155:84532',
    assetId: 'USDC_BASE',
    amountRaw: '2500000',
    owners: ['0xEvm'],
  })
})

test('a short balance leaves NO draft behind and never opens the wallet', async () => {
  // The REAL shared error, built the way the pre-flight builds it — the
  // asserted toast below is its formatted message.
  mockEnsureSufficientBalance.mockRejectedValue(
    new InsufficientBalanceError('USDC_BASE', '2500000', '0'),
  )
  const { result } = renderHook(() => useOfferSell())

  await act(async () => { await result.current.submit(ARGS) })

  // The whole point of gating before create: no escrow row, nothing to clean up.
  expect(mockCreate).not.toHaveBeenCalled()
  expect(mockExchangeCreate).not.toHaveBeenCalled()
  expect(mockDelete).not.toHaveBeenCalled()
  expect(mockSign).not.toHaveBeenCalled()
  expect(mockReplace).not.toHaveBeenCalled()
  // The shortfall survives — the generic branch would say "Failed to create the offer".
  expect(mockToast).toHaveBeenCalledWith('error', 'You need 2.5 USDC but your wallet holds 0 USDC.')
})

test('releases the submitting flag after a short balance (retryable)', async () => {
  mockEnsureSufficientBalance.mockRejectedValue(new InsufficientBalanceError('USDC_BASE', '1', '0'))
  const { result } = renderHook(() => useOfferSell())

  await act(async () => { await result.current.submit(ARGS) })

  expect(result.current.submitting).toBe(false)
})

test('an unreadable balance still posts the offer (fail-open)', async () => {
  mockEnsureSufficientBalance.mockResolvedValue(undefined)
  const { result } = renderHook(() => useOfferSell())

  await act(async () => { await result.current.submit(ARGS) })

  expect(mockCreate).toHaveBeenCalled()
  expect(mockSign).toHaveBeenCalled()
})

test('no linked wallet falls open to the 9D gate rather than a balance error', async () => {
  mockSigners = []
  const { result } = renderHook(() => useOfferSell())

  await act(async () => { await result.current.submit(ARGS) })

  expect(mockEnsureSufficientBalance).toHaveBeenCalledWith(expect.objectContaining({ owners: [] }))
  expect(mockCreate).toHaveBeenCalled()
})

test('the signer is settled before it is declared, not after', async () => {
  // On EVM the signer slot is empty until a session is live, so reading it
  // first would declare the primary and then sign with whatever connects.
  const order: string[] = []
  mockSettleSignerFor.mockImplementation(() => { order.push('settle'); return Promise.resolve() })
  mockDeclaredSignerFor.mockImplementation(() => { order.push('declare'); return 'DECLARED' })
  mockCreate.mockImplementation(() => { order.push('create'); return Promise.resolve({ escrow_id: 'e1' }) })

  const { result } = renderHook(() => useOfferSell())
  await act(async () => { await result.current.submit(ARGS) })

  expect(order).toEqual(['settle', 'declare', 'create'])
})

test('a chain with no resolvable signer sends no declaration at all', async () => {
  // Absent means "use the primary" — the behaviour that existed before the
  // field. Sending `signer_address: undefined` would be a different request.
  //
  // Asserted as key PRESENCE, not with `not.objectContaining({ signer_address:
  // expect.anything() })`: `expect.anything()` does not match undefined, so
  // that form passes against a body that carries the key with an undefined
  // value — the very thing this guards.
  mockDeclaredSignerFor.mockReturnValue(undefined)

  const { result } = renderHook(() => useOfferSell())
  await act(async () => { await result.current.submit(ARGS) })

  const [body] = mockCreate.mock.calls[0] as [Record<string, unknown>]
  expect('signer_address' in body).toBe(false)
})
