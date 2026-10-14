/**
 * Pause a manifest chain for the length of a test body, then put it back.
 *
 * `paused` is data on the shared manifest entry, and the harness's chains
 * (solana:devnet, the eip155 alt chain) are real manifest ids, so a test pauses
 * one by setting the flag on the live entry. Restored in `finally`, including
 * when the body throws, because the manifest is process-wide and a chain left
 * paused would fail every later suite in the run for a reason that points
 * nowhere near here.
 */
import { chainById } from '@tenda/shared'

export async function withChainPaused<T>(chain_id: string, body: () => Promise<T>): Promise<T> {
  const entry: { paused?: true } = chainById(chain_id)
  const before = entry.paused
  entry.paused = true
  try {
    return await body()
  } finally {
    if (before === undefined) delete entry.paused
    else entry.paused = before
  }
}
