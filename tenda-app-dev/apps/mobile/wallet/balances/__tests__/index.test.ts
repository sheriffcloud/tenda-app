/**
 * The one platform-bound line left in mobile's balances binding: resolve the
 * chain from this client's registry, then hand off to the shared pre-flight.
 *
 * The docstring makes a promise worth pinning — an unknown or not-yet-loaded
 * chain must reach the shared check as `null` so it falls OPEN. If this
 * delegated a fabricated chain instead, or threw on the miss, a user whose
 * registry had not loaded yet would be blocked from signing a transaction that
 * is in fact perfectly funded.
 *
 * Only the shared check is stubbed. The registry store stays real, so the
 * resolution being asserted is the one that ships.
 */
jest.mock('@/api/client', () => ({ api: { platform: { chains: jest.fn() } } }))
jest.mock('@tenda/shared', () => ({
  ...jest.requireActual('@tenda/shared'),
  ensureSufficientBalanceOn: jest.fn(),
}))

import { ensureSufficientBalanceOn, type ChainRegistryEntry } from '@tenda/shared'
import { useChainRegistryStore } from '@/stores/chain-registry.store'
import { ensureSufficientBalance } from '../index'

const delegate = ensureSufficientBalanceOn as jest.Mock

const BASE: ChainRegistryEntry = {
  id: 'eip155:84532',
  namespace: 'eip155',
  display_name: 'Base Sepolia',
  escrow_address: '0xEsc',
  assets: [
    {
      id: 'USDC_BASE',
      symbol: 'USDC',
      decimals: 6,
      is_stable: true,
      token_address: '0xUsdc',
      supports_permit: true,
    },
  ],
}

const ARGS = {
  chainId: 'eip155:84532',
  assetId: 'USDC_BASE',
  amountRaw: '1000000',
  owners: ['0xabc'],
}

describe('ensureSufficientBalance', () => {
  beforeEach(() => {
    delegate.mockReset()
    useChainRegistryStore.setState({ chains: [BASE], status: 'ready' })
  })

  it('resolves the chain from the registry and delegates the args unchanged', async () => {
    await ensureSufficientBalance(ARGS)
    expect(delegate).toHaveBeenCalledWith(BASE, ARGS)
  })

  it('falls open with a null chain when the id is not in the registry', async () => {
    await ensureSufficientBalance({ ...ARGS, chainId: 'solana:devnet' })
    expect(delegate).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ chainId: 'solana:devnet' }),
    )
  })

  it('falls open with a null chain when the registry has not loaded yet', async () => {
    useChainRegistryStore.setState({ chains: null, status: 'idle' })
    await ensureSufficientBalance(ARGS)
    expect(delegate).toHaveBeenCalledWith(null, ARGS)
  })

  it('propagates the shared check’s rejection rather than swallowing it', async () => {
    delegate.mockRejectedValue(new Error('insufficient USDC'))
    await expect(ensureSufficientBalance(ARGS)).rejects.toThrow('insufficient USDC')
  })
})
