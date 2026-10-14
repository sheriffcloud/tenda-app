/**
 * Database fixtures for the gas-seed hot-wallet monitor suites (#53b item 4).
 *
 * Shared by the two files that split the monitor's coverage — what it DECIDES
 * (which chains, which balances alert) and what the queued alert is WORTH (its
 * dedup id, and what it resolves to at delivery). Both need the same "a chain
 * carrying a seed" row, and two copies of that row is how one file ends up
 * asserting against a chain the other would not have checked.
 */
import type { FastifyInstance } from 'fastify'
import { chains } from '@tenda/shared/db/schema/chains'
import { GAS_SEED_LOW_BALANCE_GRANTS } from '@tenda/shared'
import type {
  AlertChannel,
  FunderBalanceReader,
  GasSeedBalanceCheckDeps,
} from '@server/features/alerts'
import { queueDouble, type QueueDouble } from './queue-double'
import { alertLogSpy, type AlertLogSpy } from './alert-log'

export const GALILEO = 'eip155:16602'
export const OTHER_CHAIN = 'eip155:16661'
/** One grant, in wei — the unit every monitor assertion counts in. */
export const GRANT = 10n ** 16n
export const FUNDER = '0x00000000000000000000000000000000000000f1'

/** The payload shape of one tick; the handler reads nothing else from it. */
export const TICK = { tick_id: 'test-tick' }

let seq = 0
function evmAddress(): `0x${string}` {
  seq += 1
  return `0x${seq.toString(16).padStart(40, '0')}`
}

export interface ChainRowOpts {
  id?: string
  /** Whether the row carries the two gas-seed columns. Default true. */
  seeded?: boolean
  enabled?: boolean
}

/** A chain row, SEEDED by default — the state this monitor exists to watch. */
export async function seedMonitorChain(
  app: FastifyInstance,
  opts: ChainRowOpts = {},
): Promise<string> {
  const id = opts.id ?? GALILEO
  await app.db.insert(chains).values({
    id,
    namespace: 'eip155',
    display_name: id,
    min_confirmations: 1,
    treasury_address: evmAddress(),
    escrow_program: evmAddress(),
    is_enabled: opts.enabled ?? true,
    ...((opts.seeded ?? true)
      ? { gas_seed_amount_raw: GRANT.toString(), gas_seed_wallet_address: FUNDER }
      : {}),
  })
  return id
}

/**
 * A balance reader answering from a fixed table — anything UNLISTED reads as
 * unreadable rather than as zero, which is the distinction the monitor turns
 * on and the one a `?? 0n` default would quietly erase.
 */
export function balances(by_chain: Record<string, bigint>): FunderBalanceReader {
  return async (chain_id) => by_chain[chain_id] ?? null
}

/**
 * The two channels the monitor's alerts fan out to in these suites.
 *
 * Under the test's control rather than the registry's, because an UNCONFIGURED
 * channel enqueues nothing — and Slack, the only real channel accepting this
 * kind, is unconfigured in every test environment. Asserting against the
 * registry would therefore assert against an empty list and pass whatever the
 * monitor did. Two of them, so "one job per channel, same id per channel" is
 * distinguishable from "one job".
 *
 * `deliver` throws rather than no-oping: the producer must never deliver
 * inline, and a silent stub would let one that did pass every assertion here.
 */
export function monitorChannels(): AlertChannel[] {
  return (['slack', 'in_app'] as const).map((name) => ({
    name,
    kinds: ['gas-seed.low-balance'],
    configured: () => true,
    deliver: () => {
      throw new Error('the producer must not deliver')
    },
  }))
}

export interface MonitorHarness {
  queue: QueueDouble
  log: AlertLogSpy
}

export function monitorHarness(): MonitorHarness {
  return { queue: queueDouble(), log: alertLogSpy() }
}

export function monitorDeps(
  app: FastifyInstance,
  readBalance: FunderBalanceReader,
  h: MonitorHarness,
): GasSeedBalanceCheckDeps {
  return {
    db: app.db,
    queue: h.queue,
    log: h.log,
    readBalance,
    low_balance_grants: GAS_SEED_LOW_BALANCE_GRANTS,
    selectChannels: monitorChannels,
  }
}
