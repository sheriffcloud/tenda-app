import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseBuildResult,
  parseBumpResult,
  releaseAssetUrl,
  assertPredictedUrlMatches,
} from './release.mjs'

const URL_OK = 'https://expo.dev/artifacts/eas/abc123.apk'
const build = (over = {}) => [
  {
    id: 'b-1',
    status: 'FINISHED',
    platform: 'ANDROID',
    artifacts: { applicationArchiveUrl: URL_OK },
    ...over,
  },
]
const BUMP = {
  version: '0.4.2',
  versionCode: 2,
  suffix: 'testnet',
  tag: 'v0.4.2-testnet',
  apk: '0.4.2-testnet.apk',
}

// --- parseBuildResult (positive) ------------------------------------------

test('parseBuildResult extracts the artifact URL from a finished build', () => {
  assert.deepEqual(parseBuildResult(JSON.stringify(build())), {
    id: 'b-1',
    status: 'FINISHED',
    platform: 'ANDROID',
    artifactUrl: URL_OK,
  })
})

test('parseBuildResult tolerates a build with no id or platform', () => {
  const result = parseBuildResult(
    JSON.stringify([{ status: 'FINISHED', artifacts: { applicationArchiveUrl: URL_OK } }]),
  )
  assert.equal(result.artifactUrl, URL_OK)
  assert.equal(result.id, '')
})

// --- parseBuildResult (negative) ------------------------------------------

/**
 * The one that matters most. eas-cli's exitWithNonZeroCodeIfSomeBuildsFailed
 * only exits non-zero for ERRORED, so a CANCELED build leaves the CLI at exit 0
 * with no artifact. Without this check the workflow would carry on and publish
 * a release with nothing usable attached.
 */
test('parseBuildResult rejects a CANCELED build, which eas-cli exits 0 for', () => {
  const cancelled = build({ status: 'CANCELED', artifacts: {} })
  assert.throws(() => parseBuildResult(JSON.stringify(cancelled)), /is CANCELED, not FINISHED/)
})

test('parseBuildResult rejects every non-finished status', () => {
  for (const status of ['ERRORED', 'IN_QUEUE', 'IN_PROGRESS', 'NEW', 'PENDING_CANCEL']) {
    assert.throws(
      () => parseBuildResult(JSON.stringify(build({ status }))),
      /not FINISHED/,
      `expected rejection for ${status}`,
    )
  }
})

test('parseBuildResult rejects a finished build with no artifact', () => {
  assert.throws(
    () => parseBuildResult(JSON.stringify(build({ artifacts: {} }))),
    /no artifacts\.applicationArchiveUrl/,
  )
  assert.throws(
    () => parseBuildResult(JSON.stringify(build({ artifacts: undefined }))),
    /no artifacts\.applicationArchiveUrl/,
  )
})

test('parseBuildResult rejects a null artifact URL rather than stringifying it', () => {
  // The exact `jq` failure this module replaces: `null` becoming "null".
  const nulled = build({ artifacts: { applicationArchiveUrl: null } })
  assert.throws(() => parseBuildResult(JSON.stringify(nulled)), /no artifacts\./)
})

test('parseBuildResult calls an EMPTY artifact URL missing, not malformed', () => {
  // Both spellings reject, but only one tells the operator the truth: an empty
  // string means EAS reported no artifact, not that the scheme was wrong.
  const empty = build({ artifacts: { applicationArchiveUrl: '' } })
  assert.throws(() => parseBuildResult(JSON.stringify(empty)), /no artifacts\.applicationArchiveUrl/)
})

test('parseBuildResult rejects a non-https artifact URL', () => {
  const insecure = build({ artifacts: { applicationArchiveUrl: 'http://expo.dev/a.apk' } })
  assert.throws(() => parseBuildResult(JSON.stringify(insecure)), /not https/)
})

test('parseBuildResult rejects output that is not an array of builds', () => {
  assert.throws(() => parseBuildResult('not json'), /did not produce JSON/)
  assert.throws(() => parseBuildResult(JSON.stringify({ status: 'FINISHED' })), /expected an array/)
  assert.throws(() => parseBuildResult('[]'), /returned no builds/)
  assert.throws(() => parseBuildResult(JSON.stringify([null])), /not an object/)
})

test('parseBuildResult refuses to guess between multiple builds', () => {
  assert.throws(() => parseBuildResult(JSON.stringify([...build(), ...build()])), /got 2/)
})

// --- parseBumpResult ------------------------------------------------------

test('parseBumpResult accepts the shape bump-version emits', () => {
  assert.deepEqual(parseBumpResult(JSON.stringify(BUMP)), BUMP)
})

test('parseBumpResult accepts a suffix-less release', () => {
  const plain = { version: '1.0.0', versionCode: 9, suffix: '', tag: 'v1.0.0', apk: '1.0.0.apk' }
  assert.deepEqual(parseBumpResult(JSON.stringify(plain)), plain)
})

test('parseBumpResult rejects a missing or mistyped field', () => {
  for (const field of ['version', 'suffix', 'tag', 'apk']) {
    const bad = { ...BUMP, [field]: 42 }
    assert.throws(
      () => parseBumpResult(JSON.stringify(bad)),
      new RegExp(`\`${field}\` is not a string`),
      `expected rejection for ${field}`,
    )
  }
})

test('parseBumpResult rejects a bad versionCode', () => {
  for (const versionCode of [0, -1, 1.5, '2', undefined]) {
    assert.throws(
      () => parseBumpResult(JSON.stringify({ ...BUMP, versionCode })),
      /versionCode must be a positive integer/,
      `expected rejection for ${JSON.stringify(versionCode)}`,
    )
  }
})

test('parseBumpResult rejects a tag or asset in the wrong format', () => {
  // The two formats differ deliberately; swapping them is a 404.
  assert.throws(() => parseBumpResult(JSON.stringify({ ...BUMP, tag: '0.4.2-testnet' })), /does not start with v/)
  assert.throws(() => parseBumpResult(JSON.stringify({ ...BUMP, apk: 'v0.4.2-testnet' })), /is not an \.apk/)
  assert.throws(() => parseBumpResult(JSON.stringify({ ...BUMP, tag: '' })), /empty tag or asset/)
})

test('parseBumpResult rejects non-objects', () => {
  assert.throws(() => parseBumpResult('nope'), /did not produce JSON/)
  assert.throws(() => parseBumpResult('[]'), /not an object/)
  assert.throws(() => parseBumpResult('null'), /not an object/)
})

// --- the URL prediction ---------------------------------------------------

test('releaseAssetUrl builds the only shape GitHub serves', () => {
  assert.equal(
    releaseAssetUrl('wisdomabioye/tenda-app', 'v0.4.2-testnet', '0.4.2-testnet.apk'),
    'https://github.com/wisdomabioye/tenda-app/releases/download/v0.4.2-testnet/0.4.2-testnet.apk',
  )
})

test('releaseAssetUrl rejects anything that is not owner/name', () => {
  for (const repo of ['tenda-app', 'a/b/c', '', 'owner name', '/name', 'owner/']) {
    assert.throws(
      () => releaseAssetUrl(repo, 'v1.0.0', '1.0.0.apk'),
      /expected repo as "owner\/name"/,
      `expected rejection for ${JSON.stringify(repo)}`,
    )
  }
})

test('assertPredictedUrlMatches passes when the page already points at this release', () => {
  const url = releaseAssetUrl('wisdomabioye/tenda-app', BUMP.tag, BUMP.apk)
  assert.equal(assertPredictedUrlMatches(url, 'wisdomabioye/tenda-app', BUMP.tag, BUMP.apk), url)
})

/**
 * The gate derives the repository from whatever URL is already in app-info.ts,
 * so a stale owner survives every other check and simply 404s. The workflow is
 * the only place that knows the real repository.
 */
test('assertPredictedUrlMatches catches a stale REPOSITORY the version gate cannot', () => {
  const stale = releaseAssetUrl('old-owner/tenda-app', BUMP.tag, BUMP.apk)
  assert.throws(
    () => assertPredictedUrlMatches(stale, 'wisdomabioye/tenda-app', BUMP.tag, BUMP.apk),
    /points somewhere this release will not publish/,
  )
})

test('assertPredictedUrlMatches catches a tag or filename that drifted', () => {
  const repo = 'wisdomabioye/tenda-app'
  assert.throws(
    () => assertPredictedUrlMatches(releaseAssetUrl(repo, 'v0.4.1-testnet', BUMP.apk), repo, BUMP.tag, BUMP.apk),
    /will not publish/,
  )
  assert.throws(
    () => assertPredictedUrlMatches(releaseAssetUrl(repo, BUMP.tag, '0.4.1-testnet.apk'), repo, BUMP.tag, BUMP.apk),
    /will not publish/,
  )
})
