/**
 * wallet/permit — the EIP-2612 client leg: capability gates (non-EVM chain,
 * asset without permit, no resolvable owner), the PERMIT_UNAVAILABLE server
 * fallback, the decline that ABORTS (never falls back), and the signed body.
 */
import { beforeEach, expect, test, vi } from 'vitest'
import { ApiClientError, WalletError } from '@tenda/shared'
import type { ChainRegistryEntry } from '@tenda/shared'

const { permitPayloadMock, signTypedDataMock, ensureSessionMock, resolveEvmFromMock, registryState } = vi.hoisted(() => ({
  permitPayloadMock: vi.fn(),
  signTypedDataMock: vi.fn(),
  ensureSessionMock: vi.fn(),
  resolveEvmFromMock: vi.fn(),
  registryState: { chains: null as ChainRegistryEntry[] | null },
}))

vi.mock('@/api/client', () => ({
  api: { blockchain: { permitPayload: (...a: unknown[]) => permitPayloadMock(...a) } },
}))
vi.mock('@/wallet/send/evm', () => ({
  signEvmTypedData: (...a: unknown[]) => signTypedDataMock(...a),
}))
vi.mock('@/wallet/send/session', () => ({
  ensureSessionOn: (...a: unknown[]) => ensureSessionMock(...a),
}))
vi.mock('@/wallet/dispatch', () => ({
  resolveEvmFrom: () => resolveEvmFromMock(),
}))
vi.mock('@/stores/chain-registry.store', () => ({
  useChainRegistryStore: { getState: () => registryState },
}))

import { buildPermitFor } from '@/wallet/permit'

const CHAIN: ChainRegistryEntry = {
  id: 'eip155:84532',
  namespace: 'eip155',
  display_name: 'Base Sepolia',
  escrow_address: '0xEscrow',
  assets: [
    { id: 'USDC_BASE', symbol: 'USDC', decimals: 6, is_stable: true, token_address: '0xT', supports_permit: true },
    { id: 'NOPERMIT', symbol: 'NOP', decimals: 6, is_stable: false, token_address: '0xN', supports_permit: false },
  ],
}

const ARGS = { chain_id: 'eip155:84532', asset: 'USDC_BASE', value_raw: '10000000' }
const PAYLOAD = { typed_data: { domain: { name: 'USDC' } }, value_raw: '10000000', deadline_unix: 1234 }

beforeEach(() => {
  registryState.chains = [CHAIN]
  ensureSessionMock.mockResolvedValue('0xOwner')
  resolveEvmFromMock.mockReturnValue('0xOwner')
  permitPayloadMock.mockResolvedValue(PAYLOAD)
  signTypedDataMock.mockResolvedValue('0xsig')
})

test('signs the server-built payload and returns the permit body', async () => {
  await expect(buildPermitFor(ARGS)).resolves.toEqual({
    value_raw: '10000000',
    deadline_unix: 1234,
    signature: '0xsig',
  })
  expect(permitPayloadMock).toHaveBeenCalledWith({
    chain_id: 'eip155:84532',
    asset: 'USDC_BASE',
    value_raw: '10000000',
    owner: '0xOwner',
  })
  // The wallet hashes EXACTLY what the server verified against the domain.
  expect(signTypedDataMock).toHaveBeenCalledWith({
    from: '0xOwner',
    typedData: PAYLOAD.typed_data,
    chainId: 'eip155:84532',
  })
})

test('a non-EVM chain is not a permit path (undefined, nothing touched)', async () => {
  await expect(buildPermitFor({ ...ARGS, chain_id: 'solana:devnet' })).resolves.toBeUndefined()
  expect(ensureSessionMock).not.toHaveBeenCalled()
  expect(permitPayloadMock).not.toHaveBeenCalled()
})

test('an asset without permit support falls back silently', async () => {
  await expect(buildPermitFor({ ...ARGS, asset: 'NOPERMIT' })).resolves.toBeUndefined()
  expect(permitPayloadMock).not.toHaveBeenCalled()
})

test('an unloaded registry or unknown chain falls back silently', async () => {
  registryState.chains = null
  await expect(buildPermitFor(ARGS)).resolves.toBeUndefined()
  registryState.chains = []
  await expect(buildPermitFor(ARGS)).resolves.toBeUndefined()
})

test('no resolvable owner falls back (dispatch surfaces the no-wallet error)', async () => {
  resolveEvmFromMock.mockReturnValue(null)
  await expect(buildPermitFor(ARGS)).resolves.toBeUndefined()
  expect(permitPayloadMock).not.toHaveBeenCalled()
})

test('PERMIT_UNAVAILABLE from the server means the approve flow, not a failure', async () => {
  permitPayloadMock.mockRejectedValue(
    new ApiClientError(409, 'Conflict', 'domain drift', 'PERMIT_UNAVAILABLE'),
  )
  await expect(buildPermitFor(ARGS)).resolves.toBeUndefined()
  expect(signTypedDataMock).not.toHaveBeenCalled()
})

test('any other payload error propagates', async () => {
  permitPayloadMock.mockRejectedValue(new ApiClientError(500, 'Internal', 'boom', 'INTERNAL_ERROR'))
  await expect(buildPermitFor(ARGS)).rejects.toThrow('boom')
})

test('a DECLINED signature aborts the flow — a decline is never a fallback', async () => {
  signTypedDataMock.mockRejectedValue(new WalletError('declined', 'refused in wallet'))
  await expect(buildPermitFor(ARGS)).rejects.toMatchObject({ code: 'declined' })
})

test('a declined connect (session guard) aborts before the server round-trip', async () => {
  ensureSessionMock.mockRejectedValue(new WalletError('declined', 'closed the modal'))
  await expect(buildPermitFor(ARGS)).rejects.toMatchObject({ code: 'declined' })
  expect(permitPayloadMock).not.toHaveBeenCalled()
})
