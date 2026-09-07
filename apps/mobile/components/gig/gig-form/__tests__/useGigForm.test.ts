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
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (select: (state: object) => object) => select({
    user: { country: 'NG' },
    wallets: [{ chain_ns: 'eip155', verified_at: '2026-01-01' }],
  }),
}))
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
  mockChains.mockResolvedValue({ data: CHAINS } as Awaited<ReturnType<typeof api.platform.chains>>)
})

it('loads eligible networks and seeds account-aware defaults', async () => {
  const { result } = renderHook(() => useGigForm(undefined, jest.fn()))

  expect(result.current.selectedCountry).toBe('NG')
  expect(result.current.chainId).toBe('solana:devnet')
  await waitFor(() => expect(result.current.chainOptions).toHaveLength(2))
  expect(result.current.chainOptions).toEqual([
    { id: 'solana:devnet', label: 'Solana', enabled: true },
    { id: 'eip155:84532', label: 'Base', enabled: true },
  ])
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
    result.current.setPaymentRaw(10_000_000)
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
    paymentRaw: 10_000_000,
  }, onSubmit))

  await act(async () => { await result.current.handleSubmit() })
  expect(result.current.warnSheetOpen).toBe(true)
  expect(onSubmit).not.toHaveBeenCalled()

  act(() => result.current.setWarnSheetOpen(false))
  await act(async () => { await result.current.submitValues() })
  expect(onSubmit).toHaveBeenCalledTimes(1)
})
