/**
 * WHERE the provider webhooks are mounted (#106).
 *
 * A route's URL here is a function of the FILESYSTEM: @fastify/autoload gives a
 * directory its name as a prefix, and a bare file inherits only its parent's.
 * That is invisible in the source — `helius.ts` says `post('/')` exactly like
 * its three sibling providers do — so the only way the path can be pinned is
 * from the outside, against the route table.
 *
 * It has already gone wrong twice in this repo. `routes/v1/blockchain/index.ts`
 * exists because `transaction.ts` was auto-loaded at the bare `/v1/blockchain`
 * while every client called `/v1/blockchain/transaction`; the client-ping 404ed
 * and verification limped along on the webhook and reconcile fallbacks.
 * `helius.ts` was the same shape: mounted at the bare `/v1/webhooks` while its
 * own docblock and docs/production_setup_guide.md §4.5 both tell operators to
 * point Helius at `/v1/webhooks/helius`.
 *
 * WHY A 404 HERE IS SO QUIET. Nothing downstream fails loudly. The provider just
 * retries into a 404 — and helius.ts answers 200 fast precisely "so Helius
 * doesn't disable the hook", so a run of failures is the thing that design is
 * avoiding. Meanwhile the interval listener and the reconcile cron still
 * converge, leaving slower finality as the only symptom. The fallbacks that make
 * the design robust are the same fallbacks that hide this.
 *
 * These paths are not covered by api-routes-drift.test.ts: that walks the shared
 * `apiRoutes` map, which is what OUR clients call, and no client calls a
 * webhook. Third parties do.
 *
 * WHAT THIS DOES NOT PIN. One directory. The general invariant — every module
 * that default-exports a plugin is reachable at the path its location implies —
 * is enforced nowhere, and only /v1/blockchain and now /v1/webhooks are pinned
 * at all. Filed as #115 rather than invented here. MEASURED while filing it: no
 * other route directory currently has the shape that breaks (a bare route file
 * beside directories). `gigs/` is the only one with bare files at all, and all
 * three are helpers with no plugin export — two say "NOT a route" in their
 * headers, `gig-feed-cursor.ts` has no header at all, which #115 picks up.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { TEST_DB_CONFIGURED, useTestApp } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/**
 * The paths operators are told to configure, taken from the runbook
 * (docs/production_setup_guide.md §4.5 Helius, §5.4 Alchemy, §9 Yellow Card and
 * Onramp.money) — the documented path IS the contract with the providers.
 *
 * Written out rather than derived from the directory listing on purpose: a list
 * derived from the filesystem would have to re-implement the autoload rule that
 * broke, and would therefore agree with whatever the layout happened to produce.
 */
const DOCUMENTED_PATHS = [
  '/v1/webhooks/helius',
  '/v1/webhooks/alchemy',
  '/v1/webhooks/onrampmoney',
  '/v1/webhooks/yellowcard',
] as const

const BARE_PREFIX = '/v1/webhooks'

test('every provider webhook is served at its documented path', { skip }, async () => {
  const app = getApp()
  const missing = DOCUMENTED_PATHS.filter((url) => !app.hasRoute({ method: 'POST', url }))
  assert.deepStrictEqual(missing, [], `documented webhook paths with no route behind them:
  ${missing.join('\n  ')}`)
})

test('the bare /v1/webhooks prefix serves nothing', { skip }, async () => {
  // The state the bug produced: helius.ts's `post('/')` landing here instead of
  // one level down. Asserted two ways because they fail for different reasons —
  // the route table says nothing is declared, and a real request confirms the
  // app answers 404 rather than falling through to some catch-all.
  const app = getApp()
  assert.strictEqual(app.hasRoute({ method: 'POST', url: BARE_PREFIX }), false)

  const res = await app.inject({ method: 'POST', url: BARE_PREFIX, payload: [] })
  assert.strictEqual(res.statusCode, 404, res.body)
})

test('the helius path is served by the HELIUS handler, not a neighbour', { skip }, async () => {
  // Existence is not identity: three of these four routes are `post('/')` in a
  // directory, and a mis-registration could put the wrong one at this path
  // while `hasRoute` stayed happy. The harness configures no chain secrets, so
  // the answer that proves WHICH handler runs is its unconfigured refusal.
  const app = getApp()
  const res = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/helius',
    payload: [{ signature: 'sig-1' }],
  })
  assert.strictEqual(res.statusCode, 503, res.body)
  assert.match(res.json().message, /Helius webhook not configured/)
})

test('the check discriminates — an unmounted sibling is not served', { skip }, async () => {
  // Guards the guard: if `hasRoute` ever stopped discriminating, the first case
  // would pass vacuously. Same reasoning as api-routes-drift.test.ts's own
  // second case.
  const app = getApp()
  assert.strictEqual(
    app.hasRoute({ method: 'POST', url: '/v1/webhooks/nonesuch' }),
    false,
    'a provider that does not exist must not be reported as mounted',
  )
})
