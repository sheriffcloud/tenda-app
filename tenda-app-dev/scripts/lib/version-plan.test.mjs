import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVersionSources, planBump } from './version-plan.mjs'

const BASE = 'https://github.com/wisdomabioye/tenda-app'

/** The three files as they look in the repo, with per-field overrides. */
const texts = ({ version = '0.4.1', code = 1, build, release = 'v0.4.1-devnet', url } = {}) => ({
  appJson: JSON.stringify(
    { expo: { version, android: { versionCode: code }, ios: { buildNumber: build ?? `${code}` } } },
    null,
    2,
  ),
  pkg: JSON.stringify({ name: 'tenda-mobile', version }, null, 2),
  appInfo: [
    'export const APP_INFO = {',
    `  apkUrl: '${url ?? `${BASE}/releases/download/${release}/${release.slice(1)}.apk`}',`,
    `  version: '${release}',`,
    '} as const',
  ].join('\n'),
})

// --- what a bump computes -------------------------------------------------

test('a patch bump advances the semver and the versionCode together', () => {
  const { current, result } = planBump(texts(), 'patch')
  assert.equal(current.version, '0.4.1')
  assert.equal(result.version, '0.4.2')
  assert.equal(result.versionCode, 2, 'versionCode must advance, or Play Store rejects the upload')
})

test('the versionCode advances by exactly one regardless of the semver jump', () => {
  for (const kind of ['patch', 'minor', 'major']) {
    assert.equal(planBump(texts({ code: 41 }), kind).result.versionCode, 42, kind)
  }
})

test('the versionCode continues from the file, not from the semver', () => {
  // A repo at 0.4.1 with versionCode 9 (more builds than releases) keeps going
  // from 9 — deriving the code from the version would silently reuse a number.
  assert.equal(planBump(texts({ code: 9 }), 'major').result.versionCode, 10)
})

test('each bump kind produces the right release name', () => {
  assert.equal(planBump(texts(), 'minor').result.tag, 'v0.5.0-devnet')
  assert.equal(planBump(texts(), 'major').result.tag, 'v1.0.0-devnet')
})

// --- the suffix -----------------------------------------------------------

test('the suffix carries forward when not given', () => {
  const { result } = planBump(texts(), 'patch')
  assert.equal(result.suffix, 'devnet')
  assert.equal(result.tag, 'v0.4.2-devnet')
})

test('an explicit suffix replaces the current one', () => {
  const { result } = planBump(texts(), 'patch', 'testnet')
  assert.equal(result.tag, 'v0.4.2-testnet')
  assert.equal(result.apk, '0.4.2-testnet.apk')
})

test('an explicit EMPTY suffix drops the qualifier rather than carrying it', () => {
  // `??` vs `||`: an empty string is a deliberate choice (the v1.0.0 release),
  // not an absent argument.
  const { result } = planBump(texts(), 'major', '')
  assert.equal(result.suffix, '')
  assert.equal(result.tag, 'v1.0.0')
  assert.equal(result.apk, '1.0.0.apk')
})

test('an invalid suffix is refused before anything is rewritten', () => {
  assert.throws(() => planBump(texts(), 'patch', 'bad/suffix'), /not usable in a git tag/)
})

// --- what the bump writes -------------------------------------------------

test('every file in the plan carries the new version', () => {
  const { next } = planBump(texts(), 'patch', 'testnet')
  const parsed = parseVersionSources(next)
  assert.deepEqual(parsed.appJson, { version: '0.4.2', versionCode: 2, buildNumber: '2' })
  assert.equal(parsed.packageVersion, '0.4.2')
  assert.equal(parsed.appInfo.release, 'v0.4.2-testnet')
  assert.equal(
    parsed.appInfo.apkUrl,
    `${BASE}/releases/download/v0.4.2-testnet/0.4.2-testnet.apk`,
    'the apkUrl is the PREDICTION the release workflow must then fulfil',
  )
})

test('the plan leaves the inputs untouched', () => {
  const before = texts()
  const snapshot = { ...before }
  planBump(before, 'major', 'testnet')
  assert.deepEqual(before, snapshot, 'planBump must be pure — the CLI decides whether to write')
})

// --- refusals -------------------------------------------------------------

/**
 * The most valuable refusal in the whole module. Bumping a repo whose files
 * already disagree would rewrite all three to agree — producing a commit that
 * looks like a clean bump while silently discarding the evidence of the drift.
 */
test('refuses to bump from an already-drifted repo rather than laundering it', () => {
  const drifted = texts()
  drifted.pkg = JSON.stringify({ name: 'tenda-mobile', version: '1.0.0' })
  assert.throws(() => planBump(drifted, 'patch'), /package\.json version "1\.0\.0" !== app\.json/)
})

test('refuses when the apkUrl was hand-edited out of sync', () => {
  const drifted = texts({ url: `${BASE}/releases/download/v0.3.0-devnet/0.3.0-devnet.apk` })
  assert.throws(() => planBump(drifted, 'patch'), /apkUrl tag/)
})

test('refuses when buildNumber and versionCode disagree', () => {
  assert.throws(() => planBump(texts({ code: 2, build: '5' }), 'patch'), /buildNumber/)
})

test('refuses an unknown bump kind', () => {
  assert.throws(() => planBump(texts(), 'pacth'), /unknown bump/)
})

test('a refusal produces no plan at all', () => {
  // Nothing partial escapes: the caller cannot receive `next` for a repo the
  // gate rejected and write it anyway.
  let plan
  try {
    plan = planBump(texts({ code: 0 }), 'patch')
  } catch {
    /* expected */
  }
  assert.equal(plan, undefined)
})
