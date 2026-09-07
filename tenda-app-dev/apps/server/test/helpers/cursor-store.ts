/**
 * In-memory `CursorStore` for the polling-listener suites.
 *
 * One fake, because there are three consumers (the EVM tick, the Solana tick,
 * and the anvil contract-migration suite) and the interface grew a second
 * position in #35 — three hand-written copies would each have needed the same
 * edit, and the compiler only names them one suite at a time.
 *
 * Records every write so a test can assert the ORDER cursors advanced in, which
 * is the whole point of the two-cursor scan: live must move before history.
 * `initCursors` records as ONE entry, because that is what it is on the wire —
 * a test that saw two would not be able to tell the atomic adoption apart from
 * the split one that lost 400,000 blocks to a crash between the writes.
 */
import type { CursorStore } from '@server/chains/cursors'

/** What a write log entry names: a live advance, a history advance, or adoption. */
type CursorWrite = ['live' | 'backfill' | 'init', number]

export interface FakeCursorStore extends CursorStore {
  /** Every live value written, adoption included, in order. */
  readonly live: number[]
  /** Every history value written, adoption included, in order. */
  readonly backfill: number[]
  /**
   * Interleaved write log — `['live', 42]`, `['backfill', 7]`, `['init', 100]`.
   * An `init` entry carries the LIVE value it wrote; its history value is the
   * matching `backfill[]` element.
   */
  readonly writes: CursorWrite[]
}

export function fakeCursorStore(
  /** `backfill: null` (the default) is an UNINITIALISED history cursor — the row a pre-#35 deployment left behind. */
  initial: { live?: number; backfill?: number | null } = {},
): FakeCursorStore {
  let live = initial.live ?? 0
  let backfill = initial.backfill ?? null
  const liveWrites: number[] = []
  const backfillWrites: number[] = []
  const writes: CursorWrite[] = []
  return {
    live: liveWrites,
    backfill: backfillWrites,
    writes,
    async getCursor() {
      return live
    },
    async setCursor(_chain, ordinal) {
      live = ordinal
      liveWrites.push(ordinal)
      writes.push(['live', ordinal])
    },
    async getBackfillCursor() {
      return backfill
    },
    async setBackfillCursor(_chain, ordinal) {
      backfill = ordinal
      backfillWrites.push(ordinal)
      writes.push(['backfill', ordinal])
    },
    async initCursors(_chain, positions) {
      live = positions.live
      backfill = positions.backfill
      liveWrites.push(positions.live)
      backfillWrites.push(positions.backfill)
      writes.push(['init', positions.live])
    },
  }
}
