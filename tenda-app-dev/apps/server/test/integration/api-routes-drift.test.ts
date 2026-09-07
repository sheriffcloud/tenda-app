/**
 * The route MAPS ↔ the server's actual route table.
 *
 * The mapped type over `ApiContract` already makes a contract endpoint with no
 * path impossible to compile. It cannot check the path is CORRECT: the values
 * are plain strings, so `/v1/gig/:id/applications` (singular) type-checks
 * happily, serves nothing, and only shows up when a client 404s in production.
 *
 * Integration tests do not close this either — they use literal URLs, so a
 * typo'd constant and a working route coexist quite comfortably.
 *
 * This walks every declared path and asserts the server answers it on some
 * method. Gated on TEST_DATABASE_URL because it needs the real app.
 *
 * TWO MAPS ARE CHECKED, not one: `apiRoutes` (web and mobile) and `adminRoutes`
 * (the dashboard). The second joined this file in #121, when it moved into
 * `@tenda/shared/api/admin` — before that it lived in apps/admin, which this
 * package cannot import, so nothing could compare it to the server at all.
 *
 * The second half of the file (#115) does the same job for the paths NEITHER
 * map describes — the provider webhooks, the ops endpoints, and a short tail of
 * routes served for no client — and, in the other direction, refuses any path
 * that nothing declares at all. See the note above NON_CONTRACT_PATHS for why
 * the filesystem makes that necessary.
 *
 * The OTHER half of this subject is test/unit/route-autoload.test.ts, which
 * asserts no file beside a routes index.ts is left unregistered. Between them:
 * that one says every module is wired in, this one says every module is wired in
 * WHERE IT CLAIMS TO BE.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { apiRoutes } from '@tenda/shared'
import { adminRoutes } from '@tenda/shared/api/admin'
import { TEST_DB_CONFIGURED, useTestApp } from '../helpers/test-app'
import { servedPaths } from '../helpers/route-table'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/**
 * The method lives in the contract TYPE, which is erased at runtime, so the
 * path is probed against every verb the API uses. Serving the path on any of
 * them is what distinguishes a real route from a typo.
 */
const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const

/**
 * Both route maps, flattened. `adminRoutes` joined `apiRoutes` here in #121 —
 * until then the dashboard's paths were listed as NON_CONTRACT_PATHS and merely
 * asserted to be SERVED, never tied to the map the dashboard actually builds
 * its URLs from. Now a renamed admin route directory fails this case.
 *
 * IT RECURSES because the two maps are not the same SHAPE. `apiRoutes` is
 * uniformly two levels (domain → endpoint); `adminRoutes` is mostly two, but
 * `platformConfig` and `metrics` are bare strings ONE level down. A fixed
 * two-level walk drops exactly those two from the declared set.
 *
 * MEASURED, not assumed: replacing this with the old two-level loop makes the
 * reverse-direction case fail naming `/v1/admin/metrics` and
 * `/v1/admin/platform-config` as served-but-undeclared. So the shape mismatch
 * does NOT fail silently — the case below catches it. It fails CONFUSINGLY,
 * reporting "nothing declares this" for two paths that plainly are declared,
 * and sending the reader to look at the routes instead of at the walk.
 *
 * Both maps go through the same walk, so there is one traversal rather than two.
 */
type RouteNode = string | { readonly [key: string]: RouteNode }

function flatten(
  node: RouteNode,
  prefix: string,
  out: Array<{ key: string; path: string }>,
): void {
  if (typeof node === 'string') {
    out.push({ key: prefix, path: node })
    return
  }
  // Every caller seeds a non-empty prefix (the map's own name), so there is no
  // empty-prefix case to handle — one less unreachable branch to explain.
  for (const [name, child] of Object.entries(node)) {
    flatten(child, `${prefix}.${name}`, out)
  }
}

function declaredPaths(): Array<{ key: string; path: string }> {
  const out: Array<{ key: string; path: string }> = []
  flatten(apiRoutes, 'apiRoutes', out)
  flatten(adminRoutes, 'adminRoutes', out)
  return out
}

test('every declared path is served — BOTH route maps', { skip }, async () => {
  const app = getApp()
  const missing = declaredPaths().filter(
    ({ path }) => !METHODS.some((method) => app.hasRoute({ method, url: path })),
  )
  assert.deepStrictEqual(
    missing,
    [],
    `route-map entries with no route behind them:\n${missing
      .map((m) => `  ${m.key} → ${m.path}`)
      .join('\n')}`,
  )
})

// Guards the guard: if `hasRoute` ever stopped discriminating, the assertion
// above would pass vacuously and this whole file would be theatre.
test('the check actually discriminates — a typo is not served', { skip }, async () => {
  const app = getApp()
  assert.strictEqual(
    METHODS.some((method) => app.hasRoute({ method, url: '/v1/gig/:id/applications' })),
    false,
  )
  // A floor under BOTH maps, so a `declaredPaths` that silently returned []
  // — an import that resolved to undefined, a walk that stopped recursing —
  // could not make the case above pass vacuously. The admin half is asserted
  // separately: without it the number would still clear 40 on `apiRoutes`
  // alone, which is exactly the regression #121 exists to prevent.
  const declared = declaredPaths()
  assert.ok(declared.length > 40, 'the maps should be substantial, not empty')
  assert.ok(
    declared.filter((d) => d.key.startsWith('adminRoutes.')).length > 30,
    'the dashboard map must be walked too, not silently skipped',
  )
})

// ---------------------------------------------------------------------------
// The half NEITHER route map covers (#115)
// ---------------------------------------------------------------------------

/**
 * Every path this server serves that NO client contract declares.
 *
 * WHY A LITERAL LIST. A route's URL is a function of the FILESYSTEM:
 * @fastify/autoload gives a DIRECTORY its name as a prefix, while a bare FILE
 * inherits only its parent's. Nothing in a route module's source says where it
 * will be mounted, so a module can end up served at a path nobody documented
 * and the only symptom is a 404 for whoever calls the documented one. That has
 * happened twice — `blockchain/transaction.ts` (the client-ping) and
 * `webhooks/helius.ts` (#106) — and both times the fix was an index.ts and a
 * hand-written test for that one directory.
 *
 * The case above closes this for every surface a client MAP declares — since
 * #121 that includes the dashboard's. It closes nothing for the surfaces no map
 * names: the provider webhooks, the ops endpoints, and three admin routes the
 * dashboard never calls. Those are exactly the paths where a 404 is quietest —
 * a webhook provider retries into a void, and nobody is watching /v1/health
 * until it matters.
 *
 * BOTH DIRECTIONS ARE ASSERTED, and the second is the one that makes this
 * self-enforcing. A list alone would only catch a path that DISAPPEARS; someone
 * adding a new non-client route has no reason to discover this file. Asserting
 * that nothing is served OUTSIDE `apiRoutes ∪ adminRoutes ∪ this list` means
 * their new route fails at the URL it actually landed on, which is both the
 * introduction to this list and — when the URL is not the one they meant — the
 * bug report.
 *
 * Measured from the real route table, not transcribed from the tree.
 */
const NON_CONTRACT_PATHS = [
  // Provider webhooks. Operators point third-party dashboards at these, so the
  // URL is a published integration contract with no client code behind it —
  // docs/production_setup_guide.md §4.5 is where an operator is told to enter
  // the Helius one, and the others are configured the same way.
  '/v1/webhooks/alchemy',
  '/v1/webhooks/helius',
  '/v1/webhooks/onrampmoney',
  '/v1/webhooks/yellowcard',

  // Ops. The platform's liveness/readiness probes and the realtime socket.
  '/v1/health',
  '/v1/health/ready',
  '/v1/ws',

  // THE ADMIN DASHBOARD API IS NO LONGER LISTED HERE (#121). Its map moved to
  // `@tenda/shared/api/admin`, so all 39 of its paths now go through
  // `declaredPaths()` above and are checked against the map the dashboard
  // actually builds URLs from — not merely asserted to exist. Rename an admin
  // route directory and the FIRST case in this file fails, naming the entry.
  //
  // These three survive the move because the dashboard does not declare them.
  // SETTLED IN #125, and all three are KEPT. WHY each one earns its place is
  // written in its own route header — escrows.ts, fiat.ts, finance.ts — the way
  // #120 settled its pair, and deliberately not restated here: one home for the
  // reasoning means one place to correct when it changes.
  //
  // #125 also corrected the record: two of the three were catalogued as
  // "tested" when their only case was a malformed id, which a preHandler
  // answers. Their success paths are covered by
  // test/integration/admin-uncalled-surfaces.test.ts.
  //
  // Listed rather than deleted, because the second case below refuses anything
  // served that nothing declares, and these are genuinely served.
  '/v1/admin/escrows/:id',
  '/v1/admin/fiat/intents/:id',
  '/v1/admin/finance/transactions',

  // Served, guarded, tested — and called by no client in this repo. Settled in
  // #120 rather than left open: both are real surfaces answering a question
  // nothing else answers (a logged-OUT reader's notices; a PARTY's on-chain
  // history for one escrow), so each keeps its path and says so in its own
  // header. They stay here rather than moving into `apiRoutes`, which types what
  // web and mobile actually call.
  '/v1/announcements',
  '/v1/escrows/:id/transactions',

  // The Agent API v0 document (#16). Served for agents, not for web or mobile,
  // so it belongs to no client route map; its own drift suite
  // (agent-api-drift.test.ts) holds it to the path it declares for itself.
  '/v1/openapi.json',
] as const

test('every path no route MAP declares is served too — webhooks and ops', { skip }, async () => {
  const served = servedPaths(getApp())
  const missing = NON_CONTRACT_PATHS.filter((path) => !served.has(path))
  assert.deepStrictEqual(
    missing,
    [],
    `these paths are declared here but the server serves nothing at them.\n` +
      `A route module's URL comes from its position in src/routes, so this is\n` +
      `what a file/directory move looks like from the outside:\n  ${missing.join('\n  ')}`,
  )
})

test('nothing is served at a path neither the contract nor this file declares', { skip }, async () => {
  const declared = new Set<string>([...declaredPaths().map((d) => d.path), ...NON_CONTRACT_PATHS])
  const unexpected = [...servedPaths(getApp())].filter((path) => !declared.has(path)).sort()
  assert.deepStrictEqual(
    unexpected,
    [],
    `the server serves these, and nothing declares them:\n  ${unexpected.join('\n  ')}\n` +
      `If that is the URL you intended, add it to apiRoutes (web/mobile), to\n` +
      `adminRoutes (the dashboard), or to NON_CONTRACT_PATHS above. If it is NOT,\n` +
      `@fastify/autoload has mounted your module somewhere you did not expect —\n` +
      `a bare FILE takes its parent's prefix, only a DIRECTORY contributes its own.`,
  )
})

// Guards the two cases above: both compare against `servedPaths`, and a parser
// that returned an empty set would make each of them pass while asserting
// nothing at all. The parser itself lives in helpers/route-table.ts (#121) —
// this is the case its docstring says a caller owes it.
test('the route-table parse produces real, whole paths', { skip }, async () => {
  const served = servedPaths(getApp())
  // THE FLOOR, and it is a real relation rather than a round number. The first
  // case says every declared path is served and the third says every
  // non-contract path is, while the last says the two lists are disjoint — so
  // the table must hold at least their union. A parser that dropped lines,
  // truncated a subtree or returned nothing cannot clear it.
  //
  // It used to compare against `declaredPaths().length`, which counted map
  // ENTRIES against served URLs. That silently stopped being a floor when #121
  // added `adminRoutes`: several entries share one URL (list/create,
  // grant/revoke a login email), so the entry count overtook the path count and
  // the case failed on a parser that was working perfectly.
  const declaredUnique = new Set(declaredPaths().map((d) => d.path))
  const atLeast = declaredUnique.size + NON_CONTRACT_PATHS.length
  assert.ok(
    served.size >= atLeast,
    `parsed ${served.size} paths, expected at least ${atLeast}`,
  )
  // A deep, parameterised path: it can only be assembled by walking the tree,
  // so its presence says segments are being joined rather than read off a line.
  assert.ok(served.has('/v1/users/:id/transactions/summary'), 'a nested path is reassembled')
  assert.ok(!served.has('/v1/users/:id/transactions/summary/'), 'the plugin root `/` is folded away')
})

// The maintenance failure mode of a hand-written list, and the only one the two
// cases above cannot see: both are satisfied by a path listed TWICE, and by a
// path that has since earned a place in a route map and been left here as well.
// Either leaves a reader unsure which map owns it.
test('the non-contract list is a set, and owns nothing a route map already owns', { skip }, async () => {
  assert.strictEqual(
    new Set(NON_CONTRACT_PATHS).size,
    NON_CONTRACT_PATHS.length,
    'NON_CONTRACT_PATHS lists a path more than once',
  )
  const contract = new Set(declaredPaths().map((d) => d.path))
  assert.deepStrictEqual(
    NON_CONTRACT_PATHS.filter((path) => contract.has(path)),
    [],
    'a route map declares these too — the first case already covers them, so drop them here',
  )
})
