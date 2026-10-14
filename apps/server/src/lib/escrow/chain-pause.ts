/**
 * The chain-pause gate: what a PAUSED chain still permits (`paused: true` on
 * its manifest entry, @tenda/shared `isChainEnabled`).
 *
 * The takedown rule, applied to a chain: refuse the ways IN, keep every way
 * OUT. The classification is the shared takedown table (`isBlockedByChainPause`
 * IS it), so this module owns only the server's half, mapping the action onto
 * a refusal, exactly as `./takedown` does for a hidden listing. It runs beside
 * `assertNotTakenDown` on the same rows and at the same call sites; the two
 * are separate on purpose, as they are separate facts (a chain decision and a
 * moderation decision) with their own error codes.
 *
 * 422 CHAIN_PAUSED, not 409: nothing about the caller's row is stale. This
 * deployment will not take what the request asked for, the family
 * RELAY_UNSUPPORTED_ASSET already belongs to.
 *
 * An unknown chain id is NOT refused here. Whether a chain is known is the
 * registry's question (and answers its own 4xx); this gate only speaks for a
 * chain the manifest knows to be paused.
 */
import { ErrorCode, chainPausedMessage, findChain, isBlockedByChainPause, isChainEnabled } from '@tenda/shared'
import type { ChainManifestEntry, TakedownAction } from '@tenda/shared'
import { AppError } from '@server/lib/errors'

/** `lookup` is a parameter (defaulted to the manifest) so a unit test can hand the gate a paused entry. */
export function assertChainNotPaused(
  chain_id: string,
  action: TakedownAction,
  lookup: (id: string) => Pick<ChainManifestEntry, 'paused'> | undefined = findChain,
): void {
  if (!isBlockedByChainPause(action)) return
  const entry = lookup(chain_id)
  if (entry === undefined || isChainEnabled(entry)) return
  throw new AppError(422, ErrorCode.CHAIN_PAUSED, chainPausedMessage(chain_id))
}
