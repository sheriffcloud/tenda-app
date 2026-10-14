/**
 * The claim hook (#53c-2): what it fetches, what it re-reads, and what a
 * failure does.
 *
 * The property with teeth is the re-read after a claim. The hook must not patch
 * its own state to "in_progress" — the server owns that answer, and a local
 * guess is what would let the card say "on its way" for a claim the server
 * refused, or offer a second claim after an idempotent one.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native'
import { ApiClientError } from '@tenda/shared'
import type { GasSeedAvailability } from '@tenda/shared'
import { useGasClaim, gasClaimForChain } from '../useGasClaim'
import { GAS_CLAIM_COPY } from '../copy'

// `mock`-prefixed on purpose: jest hoists `jest.mock` above every `const` in
// the file, and only names matching /^mock/ may be referenced from the factory.
// Without the prefix this suite fails to run at all, with an "allowed objects"
// error that names everything except the actual problem.
const mockAvailability = jest.fn()
const mockClaim = jest.fn()

jest.mock('@/api/client', () => ({
  api: {
    wallet: {
      gasSeedAvailability: () => mockAvailability(),
      claimGasSeed: (body: unknown) => mockClaim(body),
    },
  },
}))

function offer(over: Partial<GasSeedAvailability> = {}): GasSeedAvailability {
  return {
    chain_id: 'eip155:16661',
    available: true,
    amount_raw: '10000000000000000',
    state: 'unclaimed',
    reason: null,
    ...over,
  }
}

beforeEach(() => {
  mockAvailability.mockReset()
  mockClaim.mockReset()
})

it('reads availability once on mount and reports the chains', async () => {
  mockAvailability.mockResolvedValue({ chains: [offer()] })
  const { result } = renderHook(() => useGasClaim())

  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.chains).toHaveLength(1)
  expect(mockAvailability).toHaveBeenCalledTimes(1)
})

it('a failed availability read renders NOTHING rather than an error', async () => {
  // This is an offer on a screen about balances. A user who cannot be told
  // about a grant has lost nothing; an error banner about it would be noise
  // over the thing they actually came for.
  mockAvailability.mockRejectedValue(new Error('offline'))
  const { result } = renderHook(() => useGasClaim())

  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.chains).toEqual([])
  expect(result.current.error).toBeNull()
})

it('a claim RE-READS from the server instead of guessing the new state', async () => {
  // The server decides. A local `setState('in_progress')` would be a second
  // source of truth, and the one that is wrong when the claim was refused.
  mockAvailability
    .mockResolvedValueOnce({ chains: [offer()] })
    .mockResolvedValueOnce({ chains: [offer({ available: false, state: 'in_progress', reason: 'already_granted' })] })
  mockClaim.mockResolvedValue({ chain_id: 'eip155:16661', state: 'in_progress', amount_raw: '1', queued: true })

  const { result } = renderHook(() => useGasClaim())
  await waitFor(() => expect(result.current.loading).toBe(false))

  await act(async () => {
    await result.current.claim('eip155:16661')
  })

  expect(mockClaim).toHaveBeenCalledWith({ chain_id: 'eip155:16661' })
  expect(mockAvailability).toHaveBeenCalledTimes(2)
  expect(result.current.chains[0]?.state).toBe('in_progress')
  expect(result.current.chains[0]?.available).toBe(false)
})

it("a refused claim surfaces the SERVER's message, which names the reason", async () => {
  // "Verify your phone number" is actionable; a generic failure sentence is
  // not, and the server already wrote the right one.
  mockAvailability.mockResolvedValue({ chains: [offer()] })
  mockClaim.mockRejectedValue(new ApiClientError(403, 'Forbidden', 'verify your phone number', 'PHONE_VERIFICATION_REQUIRED'))

  const { result } = renderHook(() => useGasClaim())
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(async () => {
    await result.current.claim('eip155:16661')
  })

  expect(result.current.error).toBe('verify your phone number')
  expect(result.current.claiming).toBeNull()
})

it('a failure with NO message still tells the user something', async () => {
  mockAvailability.mockResolvedValue({ chains: [offer()] })
  mockClaim.mockRejectedValue(new Error('socket hang up'))

  const { result } = renderHook(() => useGasClaim())
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(async () => {
    await result.current.claim('eip155:16661')
  })

  // Silence would be indistinguishable from a tap that never registered.
  expect(result.current.error).toBe(GAS_CLAIM_COPY.failed)
  expect(result.current.claiming).toBeNull()
})

describe('gasClaimForChain', () => {
  it('finds the chain, and answers null rather than undefined when absent', () => {
    const chains = [offer({ chain_id: 'solana:devnet' }), offer()]
    expect(gasClaimForChain(chains, 'solana:devnet')?.chain_id).toBe('solana:devnet')
    expect(gasClaimForChain(chains, 'eip155:8453')).toBeNull()
  })
})

/**
 * A 200 that is not the shape we asked for (#101).
 *
 * `request<GasSeedAvailabilityResponse>` is a TYPE ASSERTION, not a parse —
 * whatever the transport returns is handed to `setChains` as if it had the
 * declared shape. The Tenda server never sends this, but the server is not the
 * only thing that can answer a request: a proxy, a CDN or a captive portal can
 * return 200 with a body of its own, and a version skew can move the shape.
 *
 * `refresh`'s catch does NOT cover it — that arm fires on a REJECTED request,
 * not on a resolved one carrying the wrong body. So the bad value was stored and
 * the failure surfaced later, from `gasClaimForChain` DURING RENDER of the
 * wallet screen: `TypeError: Cannot read properties of undefined (reading
 * 'find')`. A crash, on the app's most-visited screen, not a degradation.
 */
test.each([
  ['no `chains` key at all', {}],
  ['`chains` explicitly null', { chains: null }],
  ['`chains` is an object, not an array', { chains: { 'eip155:16661': true } }],
  ['`chains` is a string', { chains: 'eip155:16661' }],
])('a 200 with %s leaves an EMPTY offer list, not a crash', async (_label, body) => {
  mockAvailability.mockResolvedValue(body)
  const { result } = renderHook(() => useGasClaim())
  await waitFor(() => expect(result.current.loading).toBe(false))
  // The same answer the catch arm already gives for "we learned nothing".
  expect(result.current.chains).toEqual([])
  expect(() => gasClaimForChain(result.current.chains, 'eip155:16661')).not.toThrow()
})

/**
 * The ELEMENTS, not just the container (#101, second half).
 *
 * The first guard checked that `chains` was an array and stopped there, so a
 * well-formed array holding a junk entry still reached `gasClaimForChain`, whose
 * `c.chain_id` then threw on it — the same crash, one level down. Found by
 * re-running the adversarial pass against the fix rather than trusting it.
 *
 * The predicate is deliberately NARROW: an entry must be an object carrying a
 * string `chain_id`, because that is the field every consumer indexes by. It is
 * not a shape validation and does not pretend to be — whether the client should
 * validate responses properly is still the open question #101 carries.
 */
test.each([
  ['a null entry', [null]],
  ['an undefined entry', [undefined]],
  ['a string entry', ['eip155:16661']],
  ['an entry with no chain_id', [{ available: true }]],
  ['an entry whose chain_id is not a string', [{ chain_id: 42, available: true }]],
])('a junk entry (%s) is dropped rather than crashing a consumer', async (_label, chains) => {
  mockAvailability.mockResolvedValue({ chains })
  const { result } = renderHook(() => useGasClaim())
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.chains).toEqual([])
  expect(() => gasClaimForChain(result.current.chains, 'eip155:16661')).not.toThrow()
})

test('a good entry SURVIVES the element filter — the guard must not eat real offers', async () => {
  const good = { chain_id: 'eip155:16661', available: true, amount_raw: '1', state: 'unclaimed', reason: null }
  mockAvailability.mockResolvedValue({ chains: [null, good] })
  const { result } = renderHook(() => useGasClaim())
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.chains).toEqual([good])
})
