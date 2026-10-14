/**
 * The renderer a host hands to its chain rows (#100).
 *
 * Two properties matter here and neither is visual: it must answer null for
 * every chain that is not claimable right now, and a failed claim must still
 * reach the user — with no card on screen, a toast is the only thing left, and
 * silence after a tap reads as a tap that never registered.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native'
import { ApiClientError } from '@tenda/shared'
import type { GasSeedAvailability } from '@tenda/shared'
import { useGasClaimChip } from '../useGasClaimChip'
import { GAS_CLAIM_COPY } from '../copy'

// `mock`-prefixed: jest hoists `jest.mock` above every const, and only names
// matching /^mock/ may be referenced from the factory.
const mockAvailability = jest.fn()
const mockClaim = jest.fn()
const mockToast = jest.fn()

jest.mock('@/api/client', () => ({
  api: {
    wallet: {
      gasSeedAvailability: () => mockAvailability(),
      claimGasSeed: (body: unknown) => mockClaim(body),
    },
  },
}))
// Mocked at the SOURCE module, not the barrel: `jest.requireActual` on the
// barrel loads the real Text, which loads unistyles, which needs a native
// TurboModule the suite has no way to provide. The barrel re-exports from here
// (`export { ToastProvider, showToast, useToast } from './Toast'`), so mocking
// this module is what the barrel then hands out.
jest.mock('@/components/ui/Toast', () => ({
  showToast: (variant: string, message: string) => mockToast(variant, message),
}))
jest.mock('react-native-unistyles', () => ({
  StyleSheet: { create: (sheet: unknown) => sheet },
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { card: '#fff' },
        border: { default: '#ccc' },
        content: { primary: '#000', secondary: '#444', tertiary: '#666' },
      },
    },
  }),
}))


const OPEN = 'eip155:16661'
const TAKEN = 'solana:devnet'

function chains(): GasSeedAvailability[] {
  return [
    { chain_id: OPEN, available: true, amount_raw: '1', state: 'unclaimed', reason: null },
    { chain_id: TAKEN, available: false, amount_raw: '1', state: 'claimed', reason: 'already_granted' },
  ]
}


/**
 * The chip for a chain, once availability has actually landed.
 *
 * Waiting on `mockAvailability` being CALLED is not enough — the fetch resolves
 * a tick later, and until it does the renderer correctly answers null. Grabbing
 * the element too early gets that null and the test then fails on a claim that
 * never ran, which reads as a broken hook rather than a broken wait.
 */
async function chipFor(
  render: { current: (id: string) => unknown },
  chain_id: string,
): Promise<{ props: { onClaim: (id: string) => void } }> {
  await waitFor(() => expect(render.current(chain_id)).not.toBeNull())
  return render.current(chain_id) as { props: { onClaim: (id: string) => void } }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAvailability.mockResolvedValue({ chains: chains() })
})

test('a claimable chain gets a chip; an unclaimable one gets null', async () => {
  const { result } = renderHook(() => useGasClaimChip())
  await waitFor(() => expect(mockAvailability).toHaveBeenCalled())
  await waitFor(() => expect(result.current(OPEN)).not.toBeNull())
  expect(result.current(TAKEN)).toBeNull()
})

test('a chain the server said nothing about gets null', async () => {
  const { result } = renderHook(() => useGasClaimChip())
  await waitFor(() => expect(mockAvailability).toHaveBeenCalled())
  // Not "unavailable" — ABSENT. A host may render rows for chains the claim
  // endpoint never mentioned, and inventing an offer for one is how a user is
  // shown a button the server would refuse.
  expect(result.current('eip155:8453')).toBeNull()
})

test('a failed claim is TOASTED — with no card on screen there is nowhere else', async () => {
  // (statusCode, error, message, code) — the MESSAGE is the third argument.
  // Getting that order wrong makes the test assert on the error slug and look
  // like the toast is dropping the server's sentence when it is not.
  mockClaim.mockRejectedValue(
    new ApiClientError(403, 'Forbidden', 'verify your phone number', 'PHONE_VERIFICATION_REQUIRED'),
  )
  const { result } = renderHook(() => useGasClaimChip())
  await waitFor(() => expect(mockAvailability).toHaveBeenCalled())

  const chip = await chipFor(result, OPEN)
  await act(async () => {
    chip.props.onClaim(OPEN)
  })
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('error', 'verify your phone number'))
})

test('a failure with no message still says something', async () => {
  mockClaim.mockRejectedValue(new Error('socket hang up'))
  const { result } = renderHook(() => useGasClaimChip())
  await waitFor(() => expect(mockAvailability).toHaveBeenCalled())

  const chip = await chipFor(result, OPEN)
  await act(async () => {
    chip.props.onClaim(OPEN)
  })
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('error', GAS_CLAIM_COPY.failed))
})

test('a successful claim toasts NOTHING — the row is the answer', async () => {
  mockClaim.mockResolvedValue({ ok: true })
  const { result } = renderHook(() => useGasClaimChip())
  await waitFor(() => expect(mockAvailability).toHaveBeenCalled())

  const chip = await chipFor(result, OPEN)
  await act(async () => {
    chip.props.onClaim(OPEN)
  })
  await waitFor(() => expect(mockAvailability).toHaveBeenCalledTimes(2))
  expect(mockToast).not.toHaveBeenCalled()
})

/**
 * REGRESSION (#100 audit, C2). No fetch when the host has nothing to render on.
 *
 * `GasClaimSection` used to live INSIDE the wallet screen's `section === 'ready'`
 * branch, so it mounted — and fetched — only when there were balance rows. A
 * renderer hook cannot be called conditionally, so moving to one silently began
 * asking for availability on the error, loading and no-wallet paths as well. The
 * no-wallet case is the plain waste: a brand-new user with no wallet anywhere
 * gets a round trip whose every answer is `no_wallet`.
 */
test('disabled: nothing is fetched, and the renderer answers null for everything', async () => {
  const { result } = renderHook(() => useGasClaimChip({ enabled: false }))
  // A tick, so a fetch that WAS going to fire has had its chance to.
  await act(async () => {
    await Promise.resolve()
  })
  expect(mockAvailability).not.toHaveBeenCalled()
  expect(result.current(OPEN)).toBeNull()
})

test('enabled by default — a host that passes nothing still gets the offer', async () => {
  const { result } = renderHook(() => useGasClaimChip())
  await waitFor(() => expect(mockAvailability).toHaveBeenCalled())
  await waitFor(() => expect(result.current(OPEN)).not.toBeNull())
})

/**
 * The docblock in useGasClaimChip claims two IDENTICAL failures each toast,
 * because `useGasClaim` clears `error` at the start of every claim so the value
 * genuinely changes null → X → null → X. That is a real property of an effect
 * keyed on the value, and it was asserted in a comment and nowhere else — the
 * exact shape of defect this audit found in #69's job-id docblock.
 *
 * Without the reset the second failure would be silent: same string, no change,
 * no effect, and a user tapping twice sees feedback once.
 */
test('the SAME failure twice toasts twice — the error is cleared between claims', async () => {
  mockClaim.mockRejectedValue(new ApiClientError(403, 'Forbidden', 'verify your phone number', 'X'))
  const { result } = renderHook(() => useGasClaimChip())
  await waitFor(() => expect(mockAvailability).toHaveBeenCalled())

  for (let i = 0; i < 2; i += 1) {
    const chip = await chipFor(result, OPEN)
    await act(async () => {
      chip.props.onClaim(OPEN)
    })
  }
  await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(2))
})
