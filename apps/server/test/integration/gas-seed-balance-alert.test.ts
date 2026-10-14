/**
 * What the monitor's queued alert is WORTH (#53b item 4).
 *
 * Split from gas-seed-balance-monitor.test.ts, which pins what the handler
 * DECIDES. This file pins the two properties that decide whether an operator
 * ever acts on it:
 *
 *  1. The ref carries the chain and NOTHING ELSE, and still resolves to every
 *     figure a channel renders — read at delivery, not at enqueue.
 *  2. The job id is stable per chain, because that dedup is the only thing
 *     standing between a 15-minute tick and 96 identical notices a day.
 *
 * Gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  alertJobId,
  handleGasSeedBalanceCheck,
  resolveGasSeedLowBalance,
  SeedBalanceUnreadableError,
} from '@server/features/alerts'
import { TEST_DB_CONFIGURED, useTestApp } from '../helpers/test-app'
import {
  balances,
  FUNDER,
  GALILEO,
  GRANT,
  monitorDeps,
  monitorHarness,
  seedMonitorChain,
  TICK,
} from '../helpers/gas-seed-monitor-db'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

test('the queued ref RESOLVES to the live standing, with no numbers on the wire', { skip }, async () => {
  // A balance taken at enqueue is already stale when a human reads the notice,
  // and two numbers for one fact is one too many. This proves the round trip
  // end to end rather than asserting the resolver against a ref nobody built.
  const app = getApp()
  await seedMonitorChain(app)
  const h = monitorHarness()

  const reader = balances({ [GALILEO]: GRANT * 3n })
  await handleGasSeedBalanceCheck(monitorDeps(app, reader, h), TICK)

  const [job] = h.queue.alerts()
  assert.ok(job !== undefined, 'a low wallet must reach the queue')
  assert.ok(job.payload.ref.kind === 'gas-seed.low-balance')
  assert.deepStrictEqual(Object.keys(job.payload.ref).sort(), ['chain_id', 'kind'])

  // The resolver under an INJECTED reader — `resolveAlert` binds the live
  // `seededChainBalance`, which needs a configured seed key and an RPC. The ref
  // is the one the MONITOR actually queued, so the round trip is still real.
  const alert = await resolveGasSeedLowBalance(reader)(app.db, job.payload.ref)
  assert.ok(alert !== null && alert.kind === 'gas-seed.low-balance')
  assert.strictEqual(alert.chain_id, GALILEO)
  assert.strictEqual(alert.funder_address, FUNDER)
  assert.strictEqual(alert.balance_raw, (GRANT * 3n).toString())
  assert.strictEqual(alert.grant_raw, GRANT.toString())
  assert.strictEqual(alert.grants_remaining, 3)
})

test('a ref for a chain whose seed was switched OFF resolves to null, not to zeroes', { skip }, async () => {
  // The window between enqueue and delivery is real. Resolving to a zeroed
  // alert would page an operator about a wallet that is no longer in use.
  const app = getApp()
  await seedMonitorChain(app, { seeded: false })

  // A reader that WOULD answer: this proves the null comes from the chain row,
  // not from an unreadable balance standing in for it.
  const alert = await resolveGasSeedLowBalance(balances({ [GALILEO]: 0n }))(app.db, {
    kind: 'gas-seed.low-balance',
    chain_id: GALILEO,
  })

  assert.strictEqual(alert, null)
})

test('a ref for a chain DISABLED after enqueue resolves to null', { skip }, async () => {
  // The monitor skips a disabled chain; this runs later, at delivery, inside
  // the alert's 24h dedup window. Without the same `is_enabled` clause an
  // operator would be paged about a wallet nobody can claim from — the two
  // halves would be using different definitions of "carries a seed".
  const app = getApp()
  await seedMonitorChain(app, { enabled: false })

  const alert = await resolveGasSeedLowBalance(balances({ [GALILEO]: 0n }))(app.db, {
    kind: 'gas-seed.low-balance',
    chain_id: GALILEO,
  })

  assert.strictEqual(alert, null)
})

test('a ref for a chain that does not exist at all resolves to null', { skip }, async () => {
  const alert = await resolveGasSeedLowBalance(balances({ 'eip155:404': 0n }))(getApp().db, {
    kind: 'gas-seed.low-balance',
    chain_id: 'eip155:404',
  })

  assert.strictEqual(alert, null)
})

test('an UNREADABLE balance at delivery THROWS rather than resolving to null', { skip }, async () => {
  // The difference between a retry and a day of silence. `deliverAlert` drops a
  // job whose subject resolves to null — sound for a vanished escrow, fatal
  // here: this alert's job id is keyed on the chain alone and the queue keeps a
  // finished job for 24h, so a dropped job means every later tick's enqueue is
  // deduped away while the wallet keeps draining. A throw is deliverAlert's
  // retry signal, and it is the correct one for a read that may work next time.
  const app = getApp()
  await seedMonitorChain(app)

  await assert.rejects(
    () => resolveGasSeedLowBalance(balances({}))(app.db, {
      kind: 'gas-seed.low-balance',
      chain_id: GALILEO,
    }),
    (err: unknown) => err instanceof SeedBalanceUnreadableError && err.chain_id === GALILEO,
  )
})

test('two ticks produce the SAME job id — that dedup is the rate limit', { skip }, async () => {
  // Nothing else limits how often an operator hears about a wallet that stays
  // low: the tick is every 15 minutes. The balance deliberately CHANGES between
  // the two ticks — a key that varied with the reading would look like news on
  // every check, which is the mistake this pins against.
  const app = getApp()
  await seedMonitorChain(app)
  const h = monitorHarness()

  await handleGasSeedBalanceCheck(monitorDeps(app, balances({ [GALILEO]: 0n }), h), TICK)
  await handleGasSeedBalanceCheck(monitorDeps(app, balances({ [GALILEO]: GRANT }), h), {
    tick_id: 'a-later-tick',
  })

  const alerts = h.queue.alerts()
  assert.ok(alerts.length >= 2 && alerts.length % 2 === 0, 'two ticks, one job per channel each')
  const half = alerts.length / 2
  for (let i = 0; i < half; i += 1) {
    assert.ok(alerts[i].opts?.job_id !== undefined, 'no job id is no dedup')
    assert.strictEqual(alerts[i].opts?.job_id, alerts[i + half].opts?.job_id)
  }
})

test('the job id BullMQ receives survives a CAIP-2 chain id', { skip }, async () => {
  // The chain id carries a ':' of its own and BullMQ rejects a custom id that
  // does not split into exactly three parts. That rejection would surface
  // inside the producer's catch as a generic warn — a monitor that silently
  // enqueues nothing at all.
  const app = getApp()
  await seedMonitorChain(app)
  const h = monitorHarness()

  await handleGasSeedBalanceCheck(monitorDeps(app, balances({ [GALILEO]: 0n }), h), TICK)

  const alerts = h.queue.alerts()
  assert.ok(alerts.length > 0)
  for (const job of alerts) {
    const id = job.opts?.job_id
    assert.ok(id !== undefined)
    assert.ok(GALILEO.includes(':'), 'the fixture must actually exercise a CAIP-2 id')
    assert.strictEqual(id.split(':').length, 3, id)
    assert.strictEqual(id, alertJobId(job.payload.ref, job.payload.channel))
  }
})
