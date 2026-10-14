/**
 * useGigFunding — what the proof editors' output does to POST /v1/gigs:
 * the pin and `proof_params` ride the body when the form produced them, and
 * are ABSENT (not null) when it did not, so the server's "params for an
 * unrequired type" refusal can never be tripped by a composer that sent
 * nothing.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { GigFormValues } from '@tenda/shared'

const { mockEscrowCreate, mockGigCreate } = vi.hoisted(() => ({
  mockEscrowCreate: vi.fn(),
  mockGigCreate: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/components/ui/Toast', () => ({ showToast: vi.fn() }))
vi.mock('@/wallet/dispatch', () => ({
  signSendAndReport: vi.fn().mockResolvedValue('sig-1'),
  resolveSignersForChain: () => ['SoLSigner'],
  ensureTxPreconditions: vi.fn(),
  declaredSignerFor: () => undefined,
  settleSignerFor: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/wallet/balances', () => ({ ensureSufficientBalance: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/wallet/permit', () => ({ buildPermitFor: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/api/client', () => ({
  api: {
    escrows: { create: (b: unknown) => mockEscrowCreate(b), delete: vi.fn() },
    gigs: { create: (b: unknown) => mockGigCreate(b) },
  },
}))

import { useGigFunding } from '@/hooks/gig/useGigFunding'

const BASE: GigFormValues = {
  title: 'Deliver parcel',
  description: 'to the gate',
  chainId: 'solana:devnet',
  asset: 'USDC_SOL',
  paymentRaw: '10000000',
  completionDuration: 86_400,
  acceptDeadlineHours: 24,
  category: 'delivery',
  country: 'NG',
  remote: false,
  city: 'Lagos',
  proofRequirements: [],
  latitude: null,
  longitude: null,
  proofParams: null,
  requiresApproval: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockEscrowCreate.mockResolvedValue({ escrow_id: 'e1', unsigned: { kind: 'solana-tx' } })
  mockGigCreate.mockResolvedValue({})
})

async function fund(values: GigFormValues) {
  const { result } = renderHook(() => useGigFunding({ resetForm: vi.fn() }))
  act(() => result.current.setPendingValues(values))
  await act(async () => {
    await result.current.runFunding()
  })
  return mockGigCreate.mock.calls[0]?.[0] as Record<string, unknown>
}

test('the pin and proof_params ride the gig body when the form produced them', async () => {
  const body = await fund({
    ...BASE,
    proofRequirements: ['geotag', 'structured'],
    latitude: 6.5244,
    longitude: 3.3792,
    proofParams: {
      geotag: { radius_m: 500 },
      structured: { fields: [{ name: 'count', kind: 'number', required: true }] },
    },
  })
  expect(body).toMatchObject({
    proof_requirements: ['geotag', 'structured'],
    latitude: 6.5244,
    longitude: 3.3792,
    proof_params: {
      geotag: { radius_m: 500 },
      structured: { fields: [{ name: 'count', kind: 'number', required: true }] },
    },
  })
})

test('with nothing produced, the keys are ABSENT — never null on the wire', async () => {
  const body = await fund({ ...BASE, proofRequirements: ['image'] })
  expect('latitude' in body).toBe(false)
  expect('longitude' in body).toBe(false)
  expect('proof_params' in body).toBe(false)
})
