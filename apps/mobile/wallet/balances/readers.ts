import type { ChainNamespace } from '@tenda/shared'
import { solanaBalanceReader } from './solana'
import { evmBalanceReader } from './evm'
import type { BalanceReader } from './types'

/**
 * Per-namespace reader registry, the SINGLE mapping both read paths resolve
 * through (the wallet screen's fan-out in ./index and the targeted
 * ./read-asset pre-flight). Adding a chain family (e.g. a new VM) is one entry
 * here plus its reader file, call sites never change.
 */
export const READERS: Record<ChainNamespace, BalanceReader> = {
  solana: solanaBalanceReader,
  eip155: evmBalanceReader,
}
