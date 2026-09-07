/**
 * wallet/balances — the one platform-bound line: chain resolution from THIS
 * client's registry before delegating to the shared fail-open check.
 */
import { beforeEach, expect, test, vi } from 'vitest'
import type { ChainRegistryEntry } from '@tenda/shared'

const { ensureOnMock, registryState } = vi.hoisted(() => ({
  ensureOnMock: vi.fn(),
  registryState: { chains: null as ChainRegistryEntry[] | null },
}))

vi.mock('@tenda/shared', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@tenda/shared')),
  ensureSufficientBalanceOn: (...a: unknown[]) => ensureOnMock(...a),
}))
vi.mock('@/stores/chain-registry.store', () => ({
  useChainRegistryStore: { getState: () => registryState },
  selectChainById: (chains: ChainRegistryEntry[] | null, id: string) =>
    chains?.find((c) => c.id === id) ?? null,
}))

import { ensureSufficientBalance } from '@/wallet/balances'

const CHAIN: ChainRegistryEntry = {
  id: 'eip155:84532',
  namespace: 'eip155',
  display_name: 'Base Sepolia',
  escrow_address: '0xEscrow',
  assets: [
    { id: 'USDC_BASE', symbol: 'USDC', decimals: 6, is_stable: true, token_address: '0xT', supports_permit: true },
  ],
}

const ARGS = { chainId: CHAIN.id, assetId: 'USDC_BASE', amountRaw: '10', owners: ['0xa'] }

beforeEach(() => {
  registryState.chains = [CHAIN]
  ensureOnMock.mockResolvedValue(undefined)
})

test('resolves the chain from the registry and delegates', async () => {
  await ensureSufficientBalance(ARGS)
  expect(ensureOnMock).toHaveBeenCalledWith(CHAIN, ARGS)
})

test('an unknown chain delegates null — the shared check falls open on it', async () => {
  await ensureSufficientBalance({ ...ARGS, chainId: 'eip155:999' })
  expect(ensureOnMock).toHaveBeenCalledWith(null, expect.anything())
  registryState.chains = null
  await ensureSufficientBalance(ARGS)
  expect(ensureOnMock).toHaveBeenLastCalledWith(null, expect.anything())
})

test('an InsufficientBalanceError from the shared check propagates untouched', async () => {
  const err = new Error('short')
  ensureOnMock.mockRejectedValue(err)
  await expect(ensureSufficientBalance(ARGS)).rejects.toBe(err)
})
