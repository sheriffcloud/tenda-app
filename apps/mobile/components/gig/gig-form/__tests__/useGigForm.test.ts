import { act, renderHook, waitFor } from '@testing-library/react-native'
import { api } from '@/api/client'
import { useGigForm } from '../useGigForm'

const mockModeration = jest.fn((_values: object): { decision: 'warn'; reasons: string[] } | null => null)
const mockChains = api.platform.chains as jest.MockedFunction<typeof api.platform.chains>

jest.mock('@/hooks/useModerationPreview', () => ({
  useModerationPreview: (values: object) => mockModeration(values),
}))
jest.mock('@/lib/device', () => ({ getDeviceCountry: () => 'GH' }))
jest.mock('@/wallet/config', () => ({ SOLANA_NETWORK: 'devnet' }))
/**
 * walletsStatus and refreshMe are DECLARED, not omitted (#58): the hook reads
 * the status through getState() so its load-once effect does not re-fire as
 * the status changes, and a chain's enabled-ness now depends on wallets[]
 * being loaded rather than on its namespace. A mock without them makes both
 * unobservable.
 */
const mockAuthState: {
  user: { country: string }
  wallets: { chain_ns: string; verified_at: string }[]
  walletsStatus: string
  refreshMe: jest.Mock
} = {
  user: { country: 'NG' },
  wallets: [{ chain_ns: 'eip155', verified_at: '2026-01-01' }],
  walletsStatus: 'ready',
  refreshMe: jest.fn(),
}
jest.mock('@/stores/auth.store', () => {
  const useAuthStore = (select: (state: object) => object) => select(mockAuthState)
  useAuthStore.getState = () => mockAuthState
  return { useAuthStore }
})
jest.mock('@/api/client', () => ({
  api: { platform: { chains: jest.fn() } },
}))

const CHAINS = [
  {
    id: 'solana:devnet', display_name: 'Solana', namespace: 'solana',
    assets: [{ id: 'USDC_SOL' }],
  },
  {
    id: 'eip155:84532', display_name: 'Base', namespace: 'eip155',
    assets: [{ id: 'USDC_BASE' }],
  },
  {
    id: 'unsupported:1', display_name: 'Unsupported', namespace: 'other', assets: [],
  },
]

beforeEach(() => {
  jest.clearAllMocks()
  mockAuthState.walletsStatus = 'ready'
  mockAuthState.wallets = [{ chain_ns: 'eip155', verified_at: '2026-01-01' }]
  mockChains.mockResolvedValue({ data: CHAINS } as Awaited<ReturnType<typeof api.platform.chains>>)
})

it('asks for the wallets when they have not been loaded, and not when they have', async () => {
  // Load-bearing for #58 and guarded by nothing until now: chain eligibility
  // reads wallets[], so a composer that never asks tells a user who HAS a
  // linked wallet to link one — the exact inverse of the reported defect.
  mockAuthState.walletsStatus = 'idle'
  const { unmount } = renderHook(() => useGigForm(undefined, jest.fn()))
  await waitFor(() => expect(mockAuthState.refreshMe).toHaveBeenCalledTimes(1))
  unmount()

  // ...and refreshMe is NOT deduped, so a loaded list must not be refetched
  // every time the composer opens.
  mockAuthState.refreshMe.mockClear()
  mockAuthState.walletsStatus = 'ready'
  renderHook(() => useGigForm(undefined, jest.fn()))
  await waitFor(() => expect(mockChains).toHaveBeenCalled())
  expect(mockAuthState.refreshMe).not.toHaveBeenCalled()
})

it('derives whether this composer can be finished at all (#59)', async () => {
  // The question the composer used to ask only at the signature. It reads the
  // SAME options the picker renders — no second source to drift.
  const { result, unmount } = renderHook(() => useGigForm(undefined, jest.fn()))
  await waitFor(() => expect(result.current.chainOptions).toHaveLength(2))
  // This account holds an EVM wallet, so it can post.
  expect(result.current.walletGate).toBe('ok')
  unmount()

  mockAuthState.wallets = []
  const noWallet = renderHook(() => useGigForm(undefined, jest.fn()))
  await waitFor(() => expect(noWallet.result.current.chainOptions).toHaveLength(2))
  expect(noWallet.result.current.walletGate).toBe('needs_wallet')
  noWallet.unmount()

  // ...but an UNSETTLED list earns nothing: silence, not an accusation.
  mockAuthState.walletsStatus = 'loading'
  const loading = renderHook(() => useGigForm(undefined, jest.fn()))
  await waitFor(() => expect(loading.result.current.chainOptions).toHaveLength(2))
  expect(loading.result.current.walletGate).toBe('unknown')
})

it('loads eligible networks and seeds account-aware defaults', async () => {
  const { result } = renderHook(() => useGigForm(undefined, jest.fn()))

  expect(result.current.selectedCountry).toBe('NG')
  expect(result.current.chainId).toBe('solana:devnet')
  await waitFor(() => expect(result.current.chainOptions).toHaveLength(2))
  // This account holds an EVM wallet and nothing else. Before #58 BOTH chains
  // came back enabled — Solana unconditionally, because the rule only ever
  // gated eip155 — and the composer stayed pointed at a chain it could not
  // sign on, all the way to the 403 at signing.
  expect(result.current.chainOptions).toEqual([
    { id: 'solana:devnet', label: 'Solana', state: 'needs_wallet', enabled: false },
    { id: 'eip155:84532', label: 'Base', state: 'ready', enabled: true },
  ])
  // ...and the selection follows the wallet rather than the constant default.
  await waitFor(() => expect(result.current.chainId).toBe('eip155:84532'))
  expect(result.current.asset).toBe('USDC_BASE')
})

it('an explicit chain from a reposted draft is never re-derived away', async () => {
  const { result } = renderHook(() => useGigForm({ chainId: 'solana:devnet' }, jest.fn()))
  await waitFor(() => expect(result.current.chainOptions).toHaveLength(2))
  // Solana is not signable for this account, but the person chose it; the
  // composer must say so rather than silently reposting on another chain.
  expect(result.current.chainId).toBe('solana:devnet')
})

it('keeps the default network usable when registry loading fails', async () => {
  mockChains.mockRejectedValue(new Error('offline'))
  const { result } = renderHook(() => useGigForm(undefined, jest.fn()))

  await waitFor(() => expect(mockChains).toHaveBeenCalled())
  expect(result.current.chainOptions).toEqual([])
  expect(result.current.asset).toBe('USDC_SOL')
})

it('normalizes an obsolete draft chain to a valid chain and asset pair', async () => {
  const { result } = renderHook(() => useGigForm({ chainId: 'retired:1' }, jest.fn()))

  expect(result.current.chainId).toBe('solana:devnet')
  expect(result.current.asset).toBe('USDC_SOL')
  await waitFor(() => expect(result.current.chainOptions).toHaveLength(2))
  // A chain that was DROPPED is not a choice the person made, so it must not
  // count as touched — otherwise the repost stays stranded on the fallback.
  await waitFor(() => expect(result.current.chainId).toBe('eip155:84532'))
})

it('validates each stage and submits normalized remote values', async () => {
  const onSubmit = jest.fn().mockResolvedValue(undefined)
  const { result } = renderHook(() => useGigForm(undefined, onSubmit))

  expect(result.current.getStepMissingRequirement('details')).toBe('Pick a category')
  act(() => {
    result.current.setSelectedCategory('digital')
    result.current.setTitle('Design a logo')
    result.current.setDescription('Provide three polished concepts.')
    result.current.setIsRemote(true)
    result.current.setPaymentRaw('10000000')
  })
  expect(result.current.missingRequirement).toBeNull()

  await act(async () => { await result.current.handleSubmit() })
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    category: 'digital',
    remote: true,
    country: null,
    city: null,
  }))
})

it('opens the warning gate before submission and submits after it is acknowledged', async () => {
  mockModeration.mockReturnValue({ decision: 'warn', reasons: ['price'] })
  const onSubmit = jest.fn().mockResolvedValue(undefined)
  const { result } = renderHook(() => useGigForm({
    category: 'delivery',
    title: 'Deliver parcel',
    description: 'Deliver it safely.',
    remote: true,
    paymentRaw: '10000000',
  }, onSubmit))

  await act(async () => { await result.current.handleSubmit() })
  expect(result.current.warnSheetOpen).toBe(true)
  expect(onSubmit).not.toHaveBeenCalled()

  act(() => result.current.setWarnSheetOpen(false))
  await act(async () => { await result.current.submitValues() })
  expect(onSubmit).toHaveBeenCalledTimes(1)
})

it('rebuilds the proof-param draft from a reposted draft gig — pin, radius and fields', () => {
  const { result } = renderHook(() =>
    useGigForm(
      {
        proofRequirements: ['geotag', 'structured'],
        latitude: 6.5244,
        longitude: 3.3792,
        proofParams: {
          geotag: { radius_m: 120 },
          structured: { fields: [{ name: 'count', kind: 'number', required: true }] },
        },
      },
      jest.fn(),
    ),
  )
  expect(result.current.proofDraft).toEqual({
    pin: { latitude: 6.5244, longitude: 3.3792 },
    radiusText: '120',
    fields: [{ name: 'count', kind: 'number', required: true }],
  })
  // Complete params → the delivery step (and the form) is publishable.
  expect(result.current.missingRequirement).not.toMatch(/check-in|field/i)
})

it('submits the pin + params for the SELECTED types only — and nothing when none is selected', async () => {
  const onSubmit = jest.fn().mockResolvedValue(undefined)
  const { result } = renderHook(() =>
    useGigForm(
      { category: 'delivery', title: 'Deliver', description: 'x', remote: true, paymentRaw: '10000000' },
      onSubmit,
    ),
  )
  // Editor residue with no param-bearing type selected leaves the wire clean.
  act(() => result.current.setProofDraft({ ...result.current.proofDraft, pin: { latitude: 1, longitude: 2 } }))
  await act(async () => { await result.current.submitValues() })
  expect(onSubmit).toHaveBeenLastCalledWith(
    expect.objectContaining({ latitude: null, longitude: null, proofParams: null }),
  )

  // Selecting geotag (on a physical gig) carries the pin and its radius.
  act(() => {
    result.current.setIsRemote(false)
    result.current.setSelectedCity('Lagos')
    result.current.setProofRequirements(['geotag'])
  })
  await act(async () => { await result.current.submitValues() })
  expect(onSubmit).toHaveBeenLastCalledWith(
    expect.objectContaining({
      latitude: 1,
      longitude: 2,
      proofParams: { geotag: { radius_m: 500 } },
    }),
  )
})
