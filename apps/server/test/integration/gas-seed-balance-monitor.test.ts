/**
 * The gas-seed hot-wallet monitor (#53b item 4) — what it DECIDES.
 *
 * WHAT WAS MISSING BEFORE IT. The seed pays real money out of a wallet nobody
 * tops up automatically, and nothing anywhere read its balance outside a
 * one-off verify script — so the first signal that a wallet had run dry was a
 * user's claim failing. Unbounded outflow with no monitor.
 *
 * AN INTEGRATION TEST rather than a unit one, deliberately: the whole decision
 * this handler makes is "which chains carry a seed", and that is a WHERE clause
 * — enabled, wallet set, amount set. A fake store would assert my idea of the
 * query instead of the query, and the failure it exists to catch (a monitor
 * that silently checks nothing, or that checks a chain whose seed was switched
 * off) looks identical to success from outside.
 *
 * What the queued alert is WORTH — its dedup id and what it resolves to — is
 * pinned in gas-seed-balance-alert.test.ts.
 *
 * Gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { GAS_SEED_LOW_BALANCE_GRANTS } from '@tenda/shared'
import {
  handleGasSeedBalanceCheck,
  resolveGasSeedLowBalance,
  type FunderBalanceReader,
} from '@server/features/alerts'
import { TEST_DB_CONFIGURED, useTestApp } from '../helpers/test-app'
import {
  balances,
  GALILEO,
  GRANT,
  monitorDeps,
  monitorHarness,
  OTHER_CHAIN,
  seedMonitorChain,
  TICK,
} from '../helpers/gas-seed-monitor-db'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

// ---------- the alerting decision ------------------------------------------

test('a wallet BELOW the floor alerts, naming the chain', { skip }, async () => {
  const app = getApp()
  await seedMonitorChain(app)
  const h = monitorHarness()

  const result = await handleGasSeedBalanceCheck(
    monitorDeps(app, balances({ [GALILEO]: GRANT * 2n }), h),
    TICK,
  )

  assert.deepStrictEqual(result.low, [GALILEO])
  const alerts = h.queue.alerts()
  assert.ok(alerts.length > 0, 'a low wallet must reach the queue')
  for (const job of alerts) {
    assert.ok(job.payload.ref.kind === 'gas-seed.low-balance')
    assert.strictEqual(job.payload.ref.chain_id, GALILEO)
  }
})

test('a HEALTHY wallet is silent — the negative that keeps the channel readable', { skip }, async () => {
  // The failure this pins is the one that costs the alert its value: a monitor
  // that fires on a fine wallet trains an operator to mute the channel, taking
  // the dispute alerts with it.
  const app = getApp()
  await seedMonitorChain(app)
  const h = monitorHarness()

  const result = await handleGasSeedBalanceCheck(
    monitorDeps(app, balances({ [GALILEO]: GRANT * BigInt(GAS_SEED_LOW_BALANCE_GRANTS + 1) }), h),
    TICK,
  )

  assert.strictEqual(result.checked, 1, 'it must have actually looked')
  assert.deepStrictEqual(result.low, [])
  assert.deepStrictEqual(h.queue.alerts(), [])
})

test('EXACTLY at the floor alerts — the boundary is inclusive', { skip }, async () => {
  // Off-by-one here is silent in both directions and observable at this one
  // balance only. Inclusive on purpose: the floor is "few enough to act on".
  const app = getApp()
  await seedMonitorChain(app)
  const h = monitorHarness()

  const result = await handleGasSeedBalanceCheck(
    monitorDeps(app, balances({ [GALILEO]: GRANT * BigInt(GAS_SEED_LOW_BALANCE_GRANTS) }), h),
    TICK,
  )

  assert.deepStrictEqual(result.low, [GALILEO])
})

test('a wallet with a PARTIAL grant left does not round up into safety', { skip }, async () => {
  // One wei short of a grant is zero grants: the user it would be paid to is
  // refused. Reporting "1 left" here is the failure grantsRemaining floors for.
  const app = getApp()
  await seedMonitorChain(app)
  const h = monitorHarness()

  const reader = balances({ [GALILEO]: GRANT - 1n })
  await handleGasSeedBalanceCheck(monitorDeps(app, reader, h), TICK)

  // The resolver under an INJECTED reader. `resolveAlert` binds the live
  // `seededChainBalance`, which reaches an RPC through a configured seed key —
  // absent in any test environment, so it would answer null here and this
  // assertion would pass for the wrong reason.
  const alert = await resolveGasSeedLowBalance(reader)(app.db, {
    kind: 'gas-seed.low-balance',
    chain_id: GALILEO,
  })
  assert.ok(alert !== null && alert.kind === 'gas-seed.low-balance')
  assert.strictEqual(alert.grants_remaining, 0)
})

test('a DRAINED wallet alerts rather than being mistaken for unreadable', { skip }, async () => {
  const app = getApp()
  await seedMonitorChain(app)
  const h = monitorHarness()

  const result = await handleGasSeedBalanceCheck(monitorDeps(app, balances({ [GALILEO]: 0n }), h), TICK)

  assert.deepStrictEqual(result.low, [GALILEO])
  assert.deepStrictEqual(result.unreadable, [], '0 is a reading, not a failure to read')
})

// ---------- which chains are looked at at all -------------------------------

test('a chain carrying NO seed is not checked', { skip }, async () => {
  // resetDb already seeds a Solana chain with both gas columns null; this adds
  // an explicit second one so the assertion does not rest on the fixture alone.
  const app = getApp()
  await seedMonitorChain(app, { seeded: false })
  const h = monitorHarness()

  const result = await handleGasSeedBalanceCheck(monitorDeps(app, balances({}), h), TICK)

  assert.strictEqual(result.checked, 0)
  assert.deepStrictEqual(h.queue.alerts(), [])
})

test('a DISABLED chain that still carries seed columns is not checked', { skip }, async () => {
  // Switching a chain off is how a seed is stopped without dropping its
  // history. Paging an operator about a wallet nobody can claim from would be
  // an alert with no action behind it.
  const app = getApp()
  await seedMonitorChain(app, { enabled: false })
  const h = monitorHarness()

  const result = await handleGasSeedBalanceCheck(monitorDeps(app, balances({ [GALILEO]: 0n }), h), TICK)

  assert.strictEqual(result.checked, 0)
  assert.deepStrictEqual(h.queue.alerts(), [])
})

// ---------- the failure modes that must not become silence ------------------

test('an UNREADABLE balance does not alert, and does not pass as healthy', { skip }, async () => {
  // "The RPC is down" and "the wallet is empty" call for different actions, and
  // only the second is this alert's subject. But a chain unreadable every tick
  // is a monitor reporting nothing while appearing to run — so it is warned.
  const app = getApp()
  await seedMonitorChain(app)
  const h = monitorHarness()

  const result = await handleGasSeedBalanceCheck(monitorDeps(app, balances({}), h), TICK)

  assert.deepStrictEqual(result.low, [])
  assert.deepStrictEqual(result.unreadable, [GALILEO])
  assert.strictEqual(h.log.warns.length, 1)
  assert.strictEqual(h.log.warns[0].obj.chain_id, GALILEO)
})

test('one unreadable chain does not cost the NEXT chain its check', { skip }, async () => {
  // The property the sequential loop exists to keep. A handler that threw, or
  // that batched the reads, would lose the second chain's alert to the first
  // chain's RPC.
  const app = getApp()
  await seedMonitorChain(app, { id: GALILEO })
  await seedMonitorChain(app, { id: OTHER_CHAIN })
  const h = monitorHarness()

  const result = await handleGasSeedBalanceCheck(monitorDeps(app, balances({ [OTHER_CHAIN]: 0n }), h), TICK)

  assert.strictEqual(result.checked, 2)
  assert.deepStrictEqual(result.unreadable, [GALILEO])
  assert.deepStrictEqual(result.low, [OTHER_CHAIN])
})

test('a NON-Error rejection is still reported, with its text in the log', { skip }, async () => {
  // A library that rejects with a string or a plain object. `err.message` is
  // undefined for those, so a handler written as `err.message` would log
  // `err: undefined` — a warning that names the chain but not the reason, on
  // the one line an operator has to work from.
  const app = getApp()
  await seedMonitorChain(app)
  const h = monitorHarness()
  const odd: FunderBalanceReader = () => Promise.reject('rpc exploded')

  const result = await handleGasSeedBalanceCheck(monitorDeps(app, odd, h), TICK)

  assert.deepStrictEqual(result.unreadable, [GALILEO])
  assert.strictEqual(h.log.warns.length, 1)
  assert.strictEqual(h.log.warns[0].obj.err, 'rpc exploded')
})

test('a reader that THROWS is not allowed to end the tick', { skip }, async () => {
  // `seededChainBalance` catches its own RPC errors, but it is INJECTED — and a
  // monitor whose contract is "never throws" must hold for the reader it is
  // given, not only for the one it ships with.
  const app = getApp()
  await seedMonitorChain(app)
  const h = monitorHarness()
  const boom: FunderBalanceReader = () => Promise.reject(new Error('rpc down'))

  await assert.doesNotReject(() => handleGasSeedBalanceCheck(monitorDeps(app, boom, h), TICK))
})
