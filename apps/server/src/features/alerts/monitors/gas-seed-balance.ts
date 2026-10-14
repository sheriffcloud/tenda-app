/**
 * The repeatable that watches every gas-seed hot wallet (#53b item 4).
 *
 * WHAT WAS MISSING. The seed pays real money out of a wallet nobody topped up
 * automatically, and nothing anywhere read its balance outside a one-off verify
 * script. The first signal that a wallet had run dry was a user's claim
 * failing — the single moment it is too late to be useful, because the person
 * it fails for is a first-time user with no gas, which is precisely who the
 * seed exists for.
 *
 * WHY IT LIVES UNDER features/alerts RATHER THAN features/gas-seed. The
 * dependency runs one way and has to keep running one way: alerts already reads
 * gas-seed (through the barrel, for the balance reader), so gas-seed must not
 * read alerts back. Deleting the seed then means deleting its alert kind, named
 * in both removal recipes; deleting alerts leaves the seed untouched. The other
 * arrangement — a monitor inside gas-seed enqueueing an alert — closes the loop
 * and costs both features their recipe.
 *
 * IT NEVER THROWS, for the reason enqueue-alert does not: one unreachable chain
 * must not cost the other chains their check, and a repeatable that throws
 * burns its attempts and then goes quiet, which turns a monitoring gap into a
 * silent monitoring gap.
 */

import { enqueueAlert, type ChannelSelector } from '../pipeline/enqueue-alert'
import {
  seedStanding,
  seededChainIds,
  type FunderBalanceReader,
  type SeedStanding,
} from '../kinds/gas-seed-low-balance'
import type { AlertLogger } from '../types'
import type { AppDatabase } from '@server/plugins/db'
import type { QueueService } from '@server/plugins/queue'

export interface GasSeedBalanceCheckDeps {
  db: AppDatabase
  /**
   * Narrowed to `enqueue`: this handler sends one job at a time and must not
   * grow the ability to bulk-enqueue by accident. Same narrowing `enqueueAlert`
   * itself takes.
   */
  queue: Pick<QueueService, 'enqueue'>
  log: AlertLogger
  readBalance: FunderBalanceReader
  /**
   * How few grants a wallet may be worth before it is worth waking someone.
   * Injected rather than read here so the number has ONE home (the shared
   * `GAS_SEED_LOW_BALANCE_GRANTS`, wired in queue/workers/processors.ts) and so a
   * test can drive the boundary without depending on today's policy.
   */
  low_balance_grants: number
  /**
   * Which channels an alert fans out to. Optional, defaulting to the registry
   * inside `enqueueAlert` — the same seam that function already exposes, and
   * exposed again here for the same reason: a test must be able to prove "one
   * job per channel, with the dedup id" without depending on which channels
   * happen to be CONFIGURED in the environment it runs in. An unconfigured
   * channel enqueues nothing, so without this the monitor's whole queue-facing
   * half would be untestable outside a deployment with a live Slack webhook.
   */
  selectChannels?: ChannelSelector
}

export interface GasSeedBalanceCheckResult {
  /** Chains that carry a seed and were looked at. */
  checked: number
  /**
   * Chain ids found LOW, in check order.
   *
   * Named for the finding, not for the outcome: whether anyone was actually
   * told depends on a channel being configured, which this handler does not
   * know — `enqueueAlert` owns that and logs `alert reached no channel` when
   * nobody was. A field called `alerted` would let the summary line below claim
   * a notice that never left the process.
   */
  low: string[]
  /**
   * Chain ids that produced no standing, in check order — overwhelmingly a
   * balance that could not be read, and occasionally a chain whose row stopped
   * carrying a seed between the work list and the read. Neither alerts; both
   * are logged, because a chain that is quietly skipped every tick is a monitor
   * that reports nothing while appearing to run.
   */
  unreadable: string[]
}

/**
 * One tick: read every seeded chain's wallet, alert on the ones running low.
 *
 * SEQUENTIAL, not `Promise.all`. The reads are one RPC call per seeded chain —
 * a handful, once a quarter of an hour — so concurrency buys nothing measurable
 * and costs the property that a slow chain cannot delay the others' enqueues by
 * holding the whole batch open.
 *
 * The alert's own dedup does the rate limiting: `alertJobId` keys a
 * low-balance alert on the CHAIN alone, so while an earlier notice is still in
 * Redis a repeat tick re-enqueues the same job id and BullMQ drops it. With the
 * queue's 24h `removeOnComplete.age` that collapses a wallet which stays low
 * into roughly one notice a day per chain rather than one per tick — which is
 * what keeps an operator reading this channel instead of muting it.
 */
export async function handleGasSeedBalanceCheck(
  deps: GasSeedBalanceCheckDeps,
  payload: { tick_id: string },
): Promise<GasSeedBalanceCheckResult> {
  const result: GasSeedBalanceCheckResult = { checked: 0, low: [], unreadable: [] }

  const chain_ids = await seededChainIds(deps.db)
  for (const chain_id of chain_ids) {
    result.checked += 1
    // PER CHAIN, and LOAD-BEARING rather than defensive: `seedStanding` throws
    // SeedBalanceUnreadableError for every chain it cannot read, because the
    // DELIVERY path needs that as its retry signal. This is the other side of
    // that decision — here a throw is ordinary, and without this guard one
    // unreachable RPC would abandon every LATER chain in the list, turning a
    // single bad node into a tick that silently checked nothing.
    let standing: SeedStanding | null = null
    let failure: string | null = null
    try {
      standing = await seedStanding(deps.db, deps.readBalance, chain_id)
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err)
    }

    if (standing === null) {
      // TWO shapes reach here, not three: a THROW (the balance could not be
      // read — the common one) and a null RETURN (the row stopped carrying a
      // seed, or was disabled, between the work list and this read). Both are
      // "no alert", and both are worth a line — a chain that is silently
      // skipped every tick is a monitor that reports nothing while appearing to
      // run. `failure` is what tells them apart in the log.
      result.unreadable.push(chain_id)
      deps.log.warn(
        { tick_id: payload.tick_id, chain_id, ...(failure !== null ? { err: failure } : {}) },
        'gas-seed monitor: seed standing unavailable',
      )
      continue
    }
    if (standing.grants_remaining > deps.low_balance_grants) continue

    result.low.push(chain_id)
    // `enqueueAlert` is itself guarded and never throws, so one channel's
    // failure costs neither the other channel nor the next chain's check.
    // `undefined` falls through to `enqueueAlert`'s own default parameter — the
    // registry — so the optional dep needs no second copy of that default here.
    await enqueueAlert(
      deps.queue,
      { kind: 'gas-seed.low-balance', chain_id },
      deps.log,
      deps.selectChannels,
    )
  }

  deps.log.info(
    {
      tick_id: payload.tick_id,
      checked: result.checked,
      low: result.low.length,
      unreadable: result.unreadable.length,
    },
    'gas-seed monitor: tick complete',
  )
  return result
}
