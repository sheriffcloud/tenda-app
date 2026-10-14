/**
 * Read-only chain adapters for the fee scripts: built from the SAME secrets and
 * manifest the server uses (so they read the contract the server transacts with),
 * with every resolver refusing, because these scripts read fees and nothing else.
 */
import { buildAdapters } from '@server/chains'
import { getChainSecrets } from '@server/chains/secrets'
import type { ChainAdapter } from '@server/chains/types'

const refuse = async (): Promise<never> => {
  throw new Error('read-only: the fee scripts only read fees')
}

export function readOnlyAdapters(): ChainAdapter[] {
  return buildAdapters(getChainSecrets(), {
    solana: () => ({ resolveWalletAddress: refuse, resolveAsset: refuse }),
    evm: () => ({ resolveWalletAddress: refuse, resolveAsset: refuse }),
  })
}
