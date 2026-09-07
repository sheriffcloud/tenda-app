/**
 * Self-hosted EVM polling listener — the barrel, and the only place the tick is
 * wired to a clock. Import path `@server/chains/evm/listener-polling` is
 * unchanged by the folder split.
 *
 * See ./tick.ts for the two-cursor scan and ./constants.ts for the policy
 * numbers each tick is bounded by.
 */

import { createIntervalListener } from '@server/chains/interval-listener'
import type { ChainListener } from '@server/chains/types'
import { EVM_LIVE_LAG_WARN_BLOCKS, EVM_POLL_INTERVAL_MS } from './constants'
import { evmPollTick, type EvmPollTickDeps, type EvmPollTickResult } from './tick'

export {
  EVM_BACKFILL_BLOCKS,
  EVM_GETLOGS_MAX_RANGE,
  EVM_LISTENER_RPC_TIMEOUT_MS,
  EVM_LIVE_LAG_WARN_BLOCKS,
  EVM_MAX_RANGES_PER_TICK,
  EVM_POLL_INTERVAL_MS,
} from './constants'
export { evmPollTick, type EvmPollTickDeps, type EvmPollTickResult } from './tick'

/**
 * Report the tick's position every time, warn when it is bad.
 *
 * The measured failure (#35) was silent: a cursor 287,832 blocks behind head
 * looked exactly like a healthy one from outside the process. `head`, both
 * cursors and the outstanding history ride every tick's log line so the gap can
 * be charted, and the level answers the one operational question — is the app
 * serving stale escrow state RIGHT NOW (warn), or is it current with history
 * still closing behind it (info)?
 *
 * Each branch tests exactly the thing its message names. An earlier version
 * gated "history still converging" on three extra conditions; two were dead
 * (`ranges >= 1` is implied by an incomplete history, and `live_lag > 0` is
 * always true because every chain in the manifest confirms at least one block)
 * and the third, `enqueued === 0`, silenced the message precisely when history
 * had found work — the case worth seeing.
 */
function reportTick(deps: EvmPollTickDeps, result: EvmPollTickResult): void {
  const live_lag = result.head - result.cursor
  const fields = {
    chain_id: deps.chain_id,
    head: result.head,
    cursor: result.cursor,
    live_lag,
    backfill_cursor: result.backfill_cursor,
    backfill_remaining: result.backfill_remaining,
    ranges: result.ranges,
    enqueued: result.enqueued,
  }
  if (live_lag > EVM_LIVE_LAG_WARN_BLOCKS) {
    deps.log.warn(fields, 'evm polling: live cursor is falling behind head')
    return
  }
  if (result.backfill_remaining > 0) {
    deps.log.info(fields, 'evm polling: history still converging')
    return
  }
  deps.log.info(fields, 'evm polling tick')
}

export function createEvmPollingListener(
  deps: EvmPollTickDeps & { interval_ms?: number },
): ChainListener {
  return createIntervalListener({
    chain_id: deps.chain_id,
    interval_ms: deps.interval_ms ?? EVM_POLL_INTERVAL_MS,
    tick: async () => {
      const result = await evmPollTick(deps)
      reportTick(deps, result)
      return result
    },
    log: deps.log,
  })
}
