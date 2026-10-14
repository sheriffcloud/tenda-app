/**
 * Bound the feed's revision memory (#73).
 *
 * `GigFeedState.revisions` is the staleness guard: a frame for a gig whose
 * revision the client already holds is refused when older. Rows come and go —
 * a page turns, a gig closes, a filter changes — but their revisions were kept
 * FOREVER, on purpose: a late frame for a row the server has since dropped
 * must still be recognised as stale, or it replays as new. Every distinct gig
 * a session ever saw therefore stayed in the map, kilobytes per hour on a busy
 * feed and never released.
 *
 * The bound keeps every CURRENT row's revision — those are load-bearing — plus
 * the most recent `memory` others, in the order they DEPARTED. A late frame
 * arrives within seconds of the row leaving; anything older than hundreds of
 * departures is not a late frame, it is a gig the reader will meet afresh, and
 * treating it as new is the right answer.
 *
 * Departure order, not first-sight order. The first cut dropped from the front
 * of the map as first remembered, and the rows that sit longest on a feed —
 * the ones seeded at page load — are exactly the ones remembered first: when
 * one finally left after `memory` others had come and gone it was the FIRST
 * forgotten, at the moment its late frame was most likely, and that frame
 * replayed as new. MEASURED before the fix.
 */
import { MAX_PAGINATION_LIMIT } from '../utils/validation'

/**
 * How many departed rows' revisions to keep. Two server-capped pages: more
 * churn than a reader scrolls through between one frame and the next, and
 * about 12 KB at the largest page the server serves.
 */
export const GIG_FEED_REVISION_MEMORY = MAX_PAGINATION_LIMIT * 2

/**
 * The map's KEY ORDER is the record of when each row departed: departed rows
 * sit first, oldest departure first, and every current row after them. A row
 * that has just left the list is therefore found among the current rows' slots
 * and moves behind every earlier departure, which is what lets the front be
 * dropped as "the oldest". Object key order is insertion order for these
 * (non-index) keys, so a rebuilt map keeps the order it was built in. Nothing
 * to move and nothing to drop hands back the very same object.
 */
export function pruneGigFeedRevisions(
  revisions: Readonly<Record<string, string>>,
  currentIds: readonly string[],
  memory: number = GIG_FEED_REVISION_MEMORY,
): Readonly<Record<string, string>> {
  const current = new Set(currentIds)
  const entries = Object.entries(revisions)
  const departed = entries.filter(([id]) => !current.has(id))
  const held = entries.filter(([id]) => current.has(id))
  const keep = Math.max(0, memory)
  const ordered = entries.every(([id], index) => current.has(id) === index >= departed.length)
  if (ordered && departed.length <= keep) return revisions
  return Object.fromEntries([...departed.slice(Math.max(0, departed.length - keep)), ...held])
}
