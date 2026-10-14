/**
 * `withRpcFallback` on its own — the combinator every Solana caller now routes
 * through, tested without a chain.
 *
 * Worth its own file because the interesting behaviour is what it THROWS. The
 * seam's callers classify errors: the gas-seed funder's wrapper turns a failure
 * into SeedBalanceUnreadableError (which the monitor reads as "no alert"), and
 * the relayer classifies preflight failures. If this wrapped a single
 * endpoint's error in something else, both would start seeing a shape they do
 * not match on — and the symptom would be a monitor that alerts on the wrong
 * thing, or not at all.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { withRpcFallback } from '@server/chains/rpc'
import { within } from '../helpers/settle'

/** Records which clients were asked, so "never tried" is provable. */
function tracker() {
  const tried: string[] = []
  const client = (name: string, result: 'ok' | Error) => ({
    name,
    run: async () => {
      tried.push(name)
      if (result instanceof Error) throw result
      return name
    },
  })
  return { tried, client }
}

test('returns the first success and never tries the rest', async () => {
  const { tried, client } = tracker()
  const clients = [client('primary', 'ok'), client('fallback', 'ok')] as const
  const got = await withRpcFallback(clients, (c) => c.run())
  assert.strictEqual(got, 'primary')
  assert.deepStrictEqual(tried, ['primary'], 'the fallback must not be contacted on success')
})

test('falls through to the next client when the first rejects', async () => {
  const { tried, client } = tracker()
  const clients = [client('primary', new Error('down')), client('fallback', 'ok')] as const
  assert.strictEqual(await withRpcFallback(clients, (c) => c.run()), 'fallback')
  assert.deepStrictEqual(tried, ['primary', 'fallback'], 'in order, primary first')
})

test('a LONE endpoint rethrows its own error, untouched', async () => {
  // Load-bearing, not cosmetic: callers match on error identity. Wrapping the
  // single-endpoint case would change the shape every existing catch sees, on
  // the deployments that configure no fallback — i.e. most of them.
  class Bespoke extends Error {}
  const boom = new Bespoke('only endpoint down')
  const { client } = tracker()
  await assert.rejects(
    () => withRpcFallback([client('primary', boom)] as const, (c) => c.run()),
    (err: unknown) => {
      assert.strictEqual(err, boom, 'the very same error object')
      assert.ok(err instanceof Bespoke, 'and its type survives')
      return true
    },
  )
})

test('when EVERY endpoint fails it throws an AggregateError keeping both causes', async () => {
  // The path an operator actually hits during a provider outage, and the one
  // that was uncovered when this file was written. Both errors are kept because
  // the primary's is usually the diagnostic one — the fallback often fails for
  // a duller reason — and a bare rethrow of the last would discard it.
  const first = new Error('primary refused')
  const second = new Error('fallback timed out')
  const { tried, client } = tracker()
  const clients = [client('primary', first), client('fallback', second)] as const

  await assert.rejects(
    () => withRpcFallback(clients, (c) => c.run()),
    (err: unknown) => {
      assert.ok(err instanceof AggregateError, `expected AggregateError, got ${String(err)}`)
      assert.deepStrictEqual(err.errors, [first, second], 'both causes, in order')
      assert.match(err.message, /all 2 rpc endpoints failed/)
      return true
    },
  )
  assert.deepStrictEqual(tried, ['primary', 'fallback'], 'every endpoint was actually tried')
})

test('a HUNG endpoint does not block the fallback', async () => {
  // The failure mode that matters most and rejects never: TCP up, request
  // accepted, no response. web3.js `Connection` applies no request timeout of
  // its own, so without a per-ATTEMPT budget here the loop waits forever on the
  // primary and the second endpoint is never reached — failover that exists on
  // paper only. MEASURED before this option existed: still waiting after 1.5s.
  //
  // A timeout must count as a FAILURE, not as an error to propagate, or the
  // hang simply becomes a throw and the fallback is still never tried.
  const hung = { run: () => new Promise<string>(() => {}) }
  const good = { run: async () => 'fallback' }

  const got = await within(
    withRpcFallback([hung, good] as const, (c) => c.run(), { timeout_ms: 120 }),
    2_000,
    'the hung primary was never abandoned',
  )

  assert.strictEqual(got, 'fallback')
})

test('every endpoint hanging fails with the per-attempt budget, not forever', async () => {
  const hung = { run: () => new Promise<string>(() => {}) }
  await assert.rejects(
    () =>
      within(
        withRpcFallback([hung, hung] as const, (c) => c.run(), { timeout_ms: 80 }),
        2_000,
        'neither hung endpoint was abandoned',
      ),
    (err: unknown) => {
      assert.ok(err instanceof AggregateError)
      assert.strictEqual(err.errors.length, 2, 'both attempts timed out and were recorded')
      return true
    },
  )
})

test('no timeout_ms keeps the previous unbounded behaviour for a settling call', async () => {
  // The option is opt-in: callers that already bound their own budget (the
  // relayer wraps every port method) must not have a second one imposed here.
  const slowish = { run: () => new Promise<string>((r) => setTimeout(() => r('ok'), 30)) }
  assert.strictEqual(await withRpcFallback([slowish] as const, (c) => c.run()), 'ok')
})
