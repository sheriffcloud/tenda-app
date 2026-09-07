/**
 * useEscrowActions — what happens when the server refuses a transition because
 * the listing was taken down while this screen was open.
 *
 * The toast alone was the bug. A refused Accept left the same button sitting
 * there: nothing on the screen had changed, so the obvious thing to do was
 * press it again, and every press bought another 409. The refusal is the FIRST
 * the client hears of the takedown, so it has to be treated as news about the
 * escrow, not merely as a failed request.
 *
 * The other half is restraint. `onStale` re-reads the detail, which for a
 * non-party empties the screen entirely — so it must fire for this one code and
 * nothing else, or a lost packet would throw away a screen the user was using.
 *
 * Same stub strategy as the sibling useEscrowActions suites.
 */
import { renderHook, act } from '@testing-library/react-native'

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))

const mockShowToast = jest.fn()
jest.mock('@/components/ui', () => ({ showToast: (...a: unknown[]) => mockShowToast(...a) }))

const mockSignSendAndReport = jest.fn()
jest.mock('@/wallet/dispatch', () => ({
  signSendAndReport: (...a: unknown[]) => mockSignSendAndReport(...a),
  resolveSignersForChain: () => ['0xabc'],
}))
jest.mock('@/wallet/balances', () => ({
  ensureSufficientBalance: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/wallet/permit', () => ({ buildPermitFor: jest.fn() }))

const mockRequestAccept = jest.fn()
jest.mock('@/stores/escrow.store', () => ({
  useEscrowStore: () => ({ requestAccept: mockRequestAccept }),
}))

// The REAL ApiClientError, not a stub: `isTakedownRefusal` is an instanceof
// check, so a look-alike class here would make every assertion below pass for
// the wrong reason (or fail for one).
jest.mock('@/api/client', () => ({ ...jest.requireActual('@/api/client'), api: {} }))

import { TAKEDOWN_REFUSED_MESSAGE } from '@tenda/shared'
import { ApiClientError } from '@/api/client'
import { useEscrowActions } from '@/hooks/useEscrowActions'

const ARGS = { escrowId: 'e1', chainId: 'eip155:84532', asset: 'USDC_BASE', amountRaw: '10000000' }

const takenDown = () =>
  new ApiClientError(
    409,
    'Conflict',
    'This listing has been removed and is no longer open to new participants.',
    'ESCROW_TAKEN_DOWN',
  )

beforeEach(() => {
  mockShowToast.mockReset()
  mockSignSendAndReport.mockReset()
  mockRequestAccept.mockReset()
})

test('a takedown refusal re-reads the screen AND says why', async () => {
  mockRequestAccept.mockRejectedValue(takenDown())
  const onStale = jest.fn()
  const { result } = renderHook(() => useEscrowActions({ ...ARGS, onStale }))

  let ok = true
  await act(async () => {
    ok = await result.current.accept()
  })

  expect(ok).toBe(false)
  expect(onStale).toHaveBeenCalledTimes(1)
  // The server's own wording, not an invented one: it is written for a stranger
  // whose screen went stale and must not name the moderation reason.
  expect(mockShowToast).toHaveBeenCalledWith(
    'error',
    'This listing has been removed and is no longer open to new participants.',
  )
  // The refusal happens before any wallet opens — nothing was signed.
  expect(mockSignSendAndReport).not.toHaveBeenCalled()
  expect(result.current.phase).toBe('idle')
})

test.each([
  ['an ordinary 409', new ApiClientError(409, 'Conflict', 'wrong status', 'ESCROW_WRONG_STATUS')],
  ['a 500', new ApiClientError(500, 'Internal', 'boom', 'INTERNAL_ERROR')],
  ['a network failure', new TypeError('Network request failed')],
])('%s does NOT re-read the screen', async (_label, thrown) => {
  // The restraint half. `onStale` empties the screen for a non-party, so firing
  // it on a lost packet would be the same class of bug as the one being fixed,
  // pointing the other way.
  mockRequestAccept.mockRejectedValue(thrown)
  const onStale = jest.fn()
  const { result } = renderHook(() => useEscrowActions({ ...ARGS, onStale }))

  await act(async () => {
    await result.current.accept()
  })

  expect(onStale).not.toHaveBeenCalled()
  expect(mockShowToast).toHaveBeenCalledTimes(1)
})

test('a screen that passes no onStale still toasts rather than throwing', async () => {
  // The prop is optional; a caller that cannot refetch must degrade, not crash
  // inside the failure path of an already-failed action.
  mockRequestAccept.mockRejectedValue(takenDown())
  const { result } = renderHook(() => useEscrowActions(ARGS))

  let ok = true
  await act(async () => {
    ok = await result.current.accept()
  })

  expect(ok).toBe(false)
  expect(mockShowToast).toHaveBeenCalledTimes(1)
})

test('a takedown refusal with a BLANK message still explains itself', () => {
  // An envelope can arrive with no message. Falling through to the generic
  // "Transaction failed, please try again" would be the wrong advice twice
  // over: nothing failed transiently, and retrying is refused every time.
  mockRequestAccept.mockRejectedValue(new ApiClientError(409, 'Conflict', '', 'ESCROW_TAKEN_DOWN'))
  const onStale = jest.fn()
  const { result } = renderHook(() => useEscrowActions({ ...ARGS, onStale }))

  return act(async () => {
    await result.current.accept()
    const [tone, message] = mockShowToast.mock.calls[0]
    expect(tone).toBe('error')
    expect(message).toBe(TAKEDOWN_REFUSED_MESSAGE)
    expect(message).not.toMatch(/try again/i)
    expect(onStale).toHaveBeenCalledTimes(1)
  })
})
