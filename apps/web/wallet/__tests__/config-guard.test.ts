/**
 * The config module fails LOUD at import when the manifest has no EVM chain
 * of the build's kind — a misprovisioned build must not boot with a broken
 * WALLET_CHAINS. Own file: the throw happens at module init, so it needs a
 * fresh import under a mocked manifest query.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tenda/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tenda/shared')>()),
  firstEvmChainIdByKind: () => undefined,
}))

describe('wallet/config manifest guard', () => {
  it('throws at import when no EVM chain of the env kind exists', async () => {
    await expect(import('@/wallet/config')).rejects.toThrow(/no EVM chain of kind 'testnet'/)
  })
})
