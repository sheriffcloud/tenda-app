/**
 * lib/admin-links — the only place this server spells an apps/admin route.
 *
 * What is actually being pinned here is a DEGRADATION contract, not string
 * concatenation: every function returns null when `ADMIN_DASHBOARD_URL` is
 * absent or unusable, because config.ts promises "null = the alert still sends,
 * without a link". A throw or an `undefined/...` URL would instead fail the
 * alert that was meant to carry it, or put a dead link in front of a mediator.
 *
 * Env is passed explicitly to almost every case, which is the point of
 * threading it — the one default-binding test that does touch `process.env`
 * restores what it changed, and node:test gives this file its own process.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { adminDashboardBaseUrl, adminDisputeUrl } from '@server/lib/admin-links'
import { ADMIN_DASHBOARD_URL_ENV, BASE_URL_PROTOCOLS } from '@server/config'

const BASE = 'https://admin.tenda.test'

/** An env carrying just the var under test, keyed by config's own constant. */
function env(value: string): NodeJS.ProcessEnv {
  return { [ADMIN_DASHBOARD_URL_ENV]: value }
}

// ---------- the base URL -------------------------------------------------

test('adminDashboardBaseUrl: returns a valid absolute URL unchanged', () => {
  assert.strictEqual(adminDashboardBaseUrl(env(BASE)), BASE)
})

// Normalisation has to match config.ts's, or a link built here and a link built
// from the config would differ by a slash for the same deployment.
test('adminDashboardBaseUrl: strips a trailing slash and surrounding whitespace', () => {
  assert.strictEqual(adminDashboardBaseUrl(env(`  ${BASE}/  `)), BASE)
})

// Derived from the exported list rather than a literal ['https','http'] here:
// a second spelling of the policy is exactly what exporting it avoided.
test('adminDashboardBaseUrl: accepts every protocol config declares, and no others', () => {
  for (const protocol of BASE_URL_PROTOCOLS) {
    const url = `${protocol}://admin.tenda.test`
    assert.strictEqual(adminDashboardBaseUrl(env(url)), url, `${protocol} should be accepted`)
  }
  assert.strictEqual(adminDashboardBaseUrl(env('ftp://admin.tenda.test')), null)
})

test('adminDashboardBaseUrl: null when unset, blank or whitespace-only', () => {
  assert.strictEqual(adminDashboardBaseUrl({}), null)
  assert.strictEqual(adminDashboardBaseUrl(env('')), null)
  assert.strictEqual(adminDashboardBaseUrl(env('   ')), null)
})

// A malformed value cannot reach here in a running deployment — loadConfig
// refuses to boot on it. This pins the degradation anyway: if it ever does, an
// unlinked alert beats a thrown one, and NEITHER may be a half-built URL.
test('adminDashboardBaseUrl: null (never a throw, never a partial URL) for malformed values', () => {
  for (const bad of [
    'https:admin.tenda.test', // the missing-slashes typo WHATWG parsing accepts
    'admin.tenda.test',
    '//admin.tenda.test',
    'javascript:alert(1)',
    'not a url',
    'https://',
    'https://[',
  ]) {
    assert.strictEqual(adminDashboardBaseUrl(env(bad)), null, `expected null for ${bad}`)
  }
})

test('adminDashboardBaseUrl: falls back to process.env when no env is passed', () => {
  const before = process.env[ADMIN_DASHBOARD_URL_ENV]
  try {
    process.env[ADMIN_DASHBOARD_URL_ENV] = BASE
    assert.strictEqual(adminDashboardBaseUrl(), BASE)
  } finally {
    if (before === undefined) delete process.env[ADMIN_DASHBOARD_URL_ENV]
    else process.env[ADMIN_DASHBOARD_URL_ENV] = before
  }
})

// ---------- the dispute link ---------------------------------------------

test('adminDisputeUrl: routes by DISPUTE id under the dashboard base', () => {
  assert.strictEqual(
    adminDisputeUrl('11111111-2222-3333-4444-555555555555', env(BASE)),
    `${BASE}/disputes/11111111-2222-3333-4444-555555555555`,
  )
})

// The join is the part that silently breaks: `base + '/disputes'` with a base
// that kept its slash yields `//disputes`, which the dashboard's router 404s.
//
// REPEATED slashes are the case that actually escapes: lib/env's
// `stripTrailingSlash` removes exactly one BY DESIGN, and nothing upstream
// rejects the typo — `isAbsoluteUrl` and the boot check both accept it — so
// without normalising here `https://admin.tenda.test//` boots clean and emits
// dead links for as long as nobody clicks one.
test('adminDisputeUrl: exactly one slash between the base and the path', () => {
  for (const suffix of ['', '/', '//', '///']) {
    const url = adminDisputeUrl('abc', env(`${BASE}${suffix}`))
    assert.strictEqual(url, `${BASE}/disputes/abc`, `base ended with ${JSON.stringify(suffix)}`)
  }
})

// A dashboard mounted under a path must keep it — normalising the tail must not
// become "resolve against the origin", which is what `new URL(path, base)`
// would have done here.
test('adminDisputeUrl: preserves a base that has a path of its own', () => {
  assert.strictEqual(
    adminDisputeUrl('abc', env('https://tenda.test/admin//')),
    'https://tenda.test/admin/disputes/abc',
  )
})

// The two that string concatenation cannot survive: appending to a base holding
// a query or a fragment splices the path INSIDE it (`…/?x=1/disputes/<id>`).
// Both are absolute URLs, so both boot clean and both 404.
test('adminDisputeUrl: a query or fragment on the base cannot swallow the path', () => {
  for (const suffix of ['?x=1', '#section', '?x=1#section', '/?x=1', '/#section']) {
    const url = adminDisputeUrl('abc', env(`${BASE}${suffix}`))
    assert.strictEqual(url, `${BASE}/disputes/abc`, `base carried ${JSON.stringify(suffix)}`)
  }
})

test('adminDisputeUrl: a path under a base that also carries a query survives', () => {
  assert.strictEqual(
    adminDisputeUrl('abc', env('https://tenda.test/admin/?utm=x#top')),
    'https://tenda.test/admin/disputes/abc',
  )
})

// Basic-auth credentials are unusual but must not be silently dropped — which
// is exactly what rebuilding from `url.origin` instead of `url.href` would do,
// producing a link that loads a login wall instead of the dispute.
test('adminDisputeUrl: credentials embedded in the base are preserved', () => {
  assert.strictEqual(
    adminDisputeUrl('abc', env('https://ops:secret@tenda.test/')),
    'https://ops:secret@tenda.test/disputes/abc',
  )
})

test('adminDisputeUrl: null when the dashboard URL is unset', () => {
  assert.strictEqual(adminDisputeUrl('abc', {}), null)
})

// UUIDs need no encoding today; this pins that the value is encoded AT the
// interpolation, so a future identifier shape cannot smuggle a path segment.
test('adminDisputeUrl: percent-encodes the id it interpolates', () => {
  assert.strictEqual(adminDisputeUrl('a/../b?x=1', env(BASE)), `${BASE}/disputes/a%2F..%2Fb%3Fx%3D1`)
})
