/**
 * The chain pause: a deployed chain switched off by decision, with no code
 * removed (`ChainManifestEntry.paused`).
 *
 * SEMANTICS are the project's existing takedown rule, applied to a chain
 * instead of a listing: refuse the ways IN, keep every way OUT. The table is
 * NOT restated here. `TAKEDOWN_POLICY` already classifies every action as one
 * that brings a new participant or new money in (blocked) or one that lets
 * someone leave with what is theirs (allowed), and a second copy of that table
 * is exactly how a pause would one day block `approve` while a takedown does
 * not. `isBlockedByChainPause` is that table, named for this use.
 *
 * ONE question-asker: `isChainEnabled`. Code that lists the manifest for users
 * goes through it (a source-scan guard in packages/shared/test holds that), so
 * adding a list that forgets the flag fails a test instead of advertising a
 * paused chain.
 */
import type { TakedownAction } from '../constants/moderation'
import { isBlockedByTakedown } from '../constants/moderation'
import { CHAIN_MANIFEST, type ChainManifestEntry } from './manifest'

/** Whether users may start new work on this chain. False when the entry is paused. */
export function isChainEnabled(entry: Pick<ChainManifestEntry, 'paused'>): boolean {
  return entry.paused !== true
}

/** The manifest entries users may use, in manifest order. */
export function enabledChains(manifest: readonly ChainManifestEntry[] = CHAIN_MANIFEST): ChainManifestEntry[] {
  return manifest.filter(isChainEnabled)
}

/** Whether an action is refused on a paused chain: the takedown table, by name. */
export function isBlockedByChainPause(action: TakedownAction): boolean {
  return isBlockedByTakedown(action)
}

/** What the server says when it refuses one. Names the chain; invents no reason for the pause. */
export function chainPausedMessage(chain_id: string): string {
  return `Chain '${chain_id}' is paused: no new escrows or participants. Existing escrows on it can still be settled. Choose another chain from GET /v1/platform/chains.`
}
