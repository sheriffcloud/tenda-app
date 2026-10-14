/**
 * The one way an escrow action asks the registry for its chain's adapter.
 *
 * A chain can be deconfigured after an escrow was created (env removed,
 * rollback), and `ChainRegistry.get` answers an unknown id with a plain throw
 * that the app error handler turns into a 500 and a Sentry report. Asking
 * through here instead gives every caller the same clean 503.
 */
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import type { ChainAdapter, ChainRegistry } from '@server/chains/types'

export function requireChainAdapter(
  chains: Pick<ChainRegistry, 'has' | 'get'>,
  chain_id: string,
): ChainAdapter {
  if (!chains.has(chain_id)) {
    throw new AppError(
      503,
      ErrorCode.SERVICE_UNAVAILABLE,
      `chain '${chain_id}' is not currently available`,
    )
  }
  return chains.get(chain_id)
}
