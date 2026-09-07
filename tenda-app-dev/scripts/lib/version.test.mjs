import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BUMP_KINDS,
  parseSemver,
  bumpSemver,
  assertValidSuffix,
  releaseName,
  releaseTag,
  apkFileName,
  rewriteApkUrl,
  parseAppJson,
  parsePackageVersion,
  parseAppInfo,
  rewriteAppJson,
  rewritePackageVersion,
  rewriteAppInfo,
  assertVersionsConsistent,
} from './version.mjs'

const V = '0.4.1'
const SUFFIX = 'devnet'
const BASE = 'https://github.com/wisdomabioye/tenda-app'
const URL_041 = `${BASE}/releases/download/v0.4.1-devnet/0.4.1-devnet.apk`

const APP_JSON = JSON.stringify(
  { expo: { version: V, android: { versionCode: 1 }, ios: { buildNumber: '1' } } },
  null,
  2,
)
const PKG = JSON.stringify({ name: 'tenda-mobile', version: V }, null, 2)
const APP_INFO = [
  'export const APP_INFO = {',
  "  name: 'Tenda',",
  `  apkUrl: '${URL_041}',`,
  `  version: 'v${V}-${SUFFIX}',`,
  '} as const',
].join('\n')

/** The three sources as the gate consumes them, with per-file overrides. */
const sources = ({ appJson = APP_JSON, pkg = PKG, appInfo = APP_INFO } = {}) => ({
  appJson: parseAppJson(appJson),
  packageVersion: parsePackageVersion(pkg),
  appInfo: parseAppInfo(appInfo),
})

// --- semver ---------------------------------------------------------------

test('parseSemver splits a valid version', () => {
  assert.deepEqual(parseSemver('1.20.3'), { major: 1, minor: 20, patch: 3 })
})

test('parseSemver rejects non-versions', () => {
  for (const bad of ['v1.0.0', '1.0', '1.0.0-rc1', '', 'x.y.z', null, undefined, 42]) {
    assert.equal(parseSemver(bad), null, `expected null for ${JSON.stringify(bad)}`)
  }
})

test('bumpSemver bumps each component and zeroes the ones below', () => {
  assert.equal(bumpSemver('0.4.1', 'patch'), '0.4.2')
  assert.equal(bumpSemver('0.4.1', 'minor'), '0.5.0')
  assert.equal(bumpSemver('0.4.1', 'major'), '1.0.0')
})

test('bumpSemver carries double digits rather than string-comparing', () => {
  assert.equal(bumpSemver('0.9.9', 'patch'), '0.9.10')
  assert.equal(bumpSemver('0.9.9', 'minor'), '0.10.0')
})

test('bumpSemver rejects an invalid current version', () => {
  assert.throws(() => bumpSemver('v0.4.1', 'patch'), /not a valid x\.y\.z/)
})

test('bumpSemver rejects an unknown bump kind', () => {
  assert.throws(() => bumpSemver('0.4.1', 'pacth'), /unknown bump/)
  // Guards the shape the CLI and the workflow input both rely on.
  assert.deepEqual([...BUMP_KINDS], ['major', 'minor', 'patch'])
})

// --- release naming -------------------------------------------------------

test('release names carry the suffix in both formats', () => {
  assert.equal(releaseName('0.4.2', 'testnet'), '0.4.2-testnet')
  assert.equal(releaseTag('0.4.2', 'testnet'), 'v0.4.2-testnet')
  assert.equal(apkFileName('0.4.2', 'testnet'), '0.4.2-testnet.apk')
})

test('an empty suffix produces a plain release', () => {
  assert.equal(releaseTag('1.0.0', ''), 'v1.0.0')
  assert.equal(apkFileName('1.0.0', ''), '1.0.0.apk')
})

test('assertValidSuffix accepts the shapes a git tag and a URL both allow', () => {
  for (const ok of ['', 'testnet', 'rc1', 'testnet-rc1', 'test_net', '0.1']) {
    assert.equal(assertValidSuffix(ok), ok)
  }
})

test('assertValidSuffix rejects anything a git tag or URL would mangle', () => {
  for (const bad of ['test net', 'a/b', '-testnet', 'testnet-', '.rc', 'rc.', 'te~st', 'te:st']) {
    assert.throws(
      () => assertValidSuffix(bad),
      /not usable in a git tag and a URL/,
      `expected rejection for ${JSON.stringify(bad)}`,
    )
  }
  assert.throws(() => assertValidSuffix(undefined), /suffix must be a string/)
})

test('an invalid suffix cannot reach a tag or a filename', () => {
  assert.throws(() => releaseTag('1.0.0', 'a/b'), /not usable/)
  assert.throws(() => apkFileName('1.0.0', 'a/b'), /not usable/)
})

test('rewriteApkUrl keeps the repository and swaps both segments', () => {
  assert.equal(
    rewriteApkUrl(URL_041, '0.4.2', 'testnet'),
    `${BASE}/releases/download/v0.4.2-testnet/0.4.2-testnet.apk`,
  )
})

test('rewriteApkUrl preserves a different host and repo (nothing is hardcoded)', () => {
  const other = 'https://git.example.com/acme/app/releases/download/v1.0.0/1.0.0.apk'
  assert.equal(
    rewriteApkUrl(other, '1.0.1', ''),
    'https://git.example.com/acme/app/releases/download/v1.0.1/1.0.1.apk',
  )
})

test('rewriteApkUrl rejects a URL that is not a release download', () => {
  assert.throws(() => rewriteApkUrl(`${BASE}/releases/latest`, '1.0.0', ''), /release-download URL/)
})

// --- parsers --------------------------------------------------------------

test('parseAppJson reads all three fields', () => {
  assert.deepEqual(parseAppJson(APP_JSON), { version: V, versionCode: 1, buildNumber: '1' })
})

test('parseAppJson reports missing fields as undefined rather than throwing', () => {
  assert.deepEqual(parseAppJson('{}'), {
    version: undefined,
    versionCode: undefined,
    buildNumber: undefined,
  })
})

test('parsePackageVersion reads the version field', () => {
  assert.equal(parsePackageVersion(PKG), V)
})

test('parseAppInfo splits the release, suffix and both URL segments', () => {
  assert.deepEqual(parseAppInfo(APP_INFO), {
    release: 'v0.4.1-devnet',
    version: V,
    suffix: SUFFIX,
    apkUrl: URL_041,
    apkTag: 'v0.4.1-devnet',
    apkFile: '0.4.1-devnet.apk',
  })
})

test('parseAppInfo keeps a multi-part suffix intact', () => {
  const text = APP_INFO.replace("'v0.4.1-devnet'", "'v0.4.1-testnet-rc1'")
  assert.equal(parseAppInfo(text).suffix, 'testnet-rc1')
})

test('parseAppInfo reports an unparseable release as null rather than guessing', () => {
  const text = APP_INFO.replace("'v0.4.1-devnet'", "'0.4.1-devnet'")
  const parsed = parseAppInfo(text)
  assert.equal(parsed.version, null)
  assert.equal(parsed.release, '0.4.1-devnet')
})

/**
 * The state the repo enters the first time a release ships without a `-testnet`
 * qualifier. Everything downstream — the tag, the asset name, the gate — has to
 * treat "no suffix" as an empty string, not as absent: `undefined` would reach
 * assertValidSuffix and fail a perfectly legitimate v1.0.0 release.
 */
const PLAIN = [
  'export const APP_INFO = {',
  `  apkUrl: '${BASE}/releases/download/v1.0.0/1.0.0.apk',`,
  "  version: 'v1.0.0',",
  '} as const',
].join('\n')

test('parseAppInfo reads a suffix-less release as an empty suffix', () => {
  const parsed = parseAppInfo(PLAIN)
  assert.equal(parsed.version, '1.0.0')
  assert.equal(parsed.suffix, '', 'a missing suffix must be "" — undefined breaks the tag builder')
  assert.equal(parsed.apkTag, 'v1.0.0')
  assert.equal(parsed.apkFile, '1.0.0.apk')
})

test('the gate passes on a suffix-less release', () => {
  const appJson = JSON.stringify({
    expo: { version: '1.0.0', android: { versionCode: 7 }, ios: { buildNumber: '7' } },
  })
  const result = assertVersionsConsistent(
    sources({ appJson, pkg: JSON.stringify({ version: '1.0.0' }), appInfo: PLAIN }),
  )
  assert.deepEqual(result, {
    version: '1.0.0',
    versionCode: 7,
    suffix: '',
    tag: 'v1.0.0',
    apk: '1.0.0.apk',
  })
})

test('parseAppInfo throws when a field is missing', () => {
  assert.throws(() => parseAppInfo("apkUrl: 'x'"), /no app-info version found/)
  assert.throws(() => parseAppInfo("version: 'v1.0.0'"), /no app-info apkUrl found/)
})

test('parseAppInfo throws when a field appears twice', () => {
  assert.throws(() => parseAppInfo(`${APP_INFO}\nversion: 'v9.9.9'`), /2 app-info version entries/)
})

test('parseAppInfo throws on an apkUrl that is not a release download', () => {
  const text = APP_INFO.replace(URL_041, `${BASE}/releases/latest`)
  assert.throws(() => parseAppInfo(text), /release-download URL/)
})

// --- rewriters ------------------------------------------------------------

test('rewriteAppJson updates version, versionCode and buildNumber together', () => {
  const out = rewriteAppJson(APP_JSON, { version: '0.4.2', versionCode: 2 })
  assert.deepEqual(parseAppJson(out), { version: '0.4.2', versionCode: 2, buildNumber: '2' })
})

test('rewriteAppJson throws rather than writing a file that lost a field', () => {
  const noCode = JSON.stringify({ expo: { version: V, ios: { buildNumber: '1' } } }, null, 2)
  assert.throws(
    () => rewriteAppJson(noCode, { version: '0.4.2', versionCode: 2 }),
    /cannot rewrite app\.json versionCode/,
  )
})

test('rewritePackageVersion changes only the version line', () => {
  const out = rewritePackageVersion(PKG, '0.4.2')
  assert.equal(parsePackageVersion(out), '0.4.2')
  assert.equal(JSON.parse(out).name, 'tenda-mobile')
})

test('rewritePackageVersion throws when the field is absent', () => {
  assert.throws(() => rewritePackageVersion('{"name":"x"}', '1.0.0'), /cannot rewrite/)
})

// An ambiguous rewrite must refuse rather than pick one. A dependency literally
// named `version` would otherwise make the bump silently edit the WRONG line and
// leave the real version untouched — a corrupted package.json that still parses.
test('rewritePackageVersion refuses when the pattern is ambiguous', () => {
  const ambiguous = JSON.stringify(
    { name: 'tenda-mobile', version: '0.4.1', dependencies: { version: '^7.0.0' } },
    null,
    2,
  )
  assert.throws(() => rewritePackageVersion(ambiguous, '0.4.2'), /2 matches/)
})

test('rewriteAppJson refuses when a field appears twice', () => {
  const ambiguous = JSON.stringify({
    expo: { version: V, android: { versionCode: 1 }, ios: { buildNumber: '1' } },
    other: { version: '9.9.9' },
  })
  assert.throws(() => rewriteAppJson(ambiguous, { version: '0.4.2', versionCode: 2 }), /2 matches/)
})

test('a rewritten file survives a `$` in the URL it carries', () => {
  // `String.replace` would read `$&` in a replacement as a substitution pattern;
  // the rewriters splice by index so file content passes through verbatim.
  // The function form is required here for the same reason the rewriters splice
  // by index: a plain string replacement would expand this `$&` itself.
  const odd = APP_INFO.replace(BASE, () => 'https://example.com/a$&b/repo')
  const out = parseAppInfo(rewriteAppInfo(odd, { version: '0.4.2', suffix: 'testnet' }))
  assert.equal(out.apkUrl, 'https://example.com/a$&b/repo/releases/download/v0.4.2-testnet/0.4.2-testnet.apk')
})

test('rewriteAppInfo updates the release and both URL segments', () => {
  const out = rewriteAppInfo(APP_INFO, { version: '0.4.2', suffix: 'testnet' })
  assert.deepEqual(parseAppInfo(out), {
    release: 'v0.4.2-testnet',
    version: '0.4.2',
    suffix: 'testnet',
    apkUrl: `${BASE}/releases/download/v0.4.2-testnet/0.4.2-testnet.apk`,
    apkTag: 'v0.4.2-testnet',
    apkFile: '0.4.2-testnet.apk',
  })
})

test('rewriteAppInfo can drop the suffix for a plain release', () => {
  const out = parseAppInfo(rewriteAppInfo(APP_INFO, { version: '1.0.0', suffix: '' }))
  assert.equal(out.release, 'v1.0.0')
  assert.equal(out.apkFile, '1.0.0.apk')
})

test('a rewrite round-trips through the gate', () => {
  const next = { version: '0.4.2', suffix: 'testnet' }
  const result = assertVersionsConsistent(
    sources({
      appJson: rewriteAppJson(APP_JSON, { version: next.version, versionCode: 2 }),
      pkg: rewritePackageVersion(PKG, next.version),
      appInfo: rewriteAppInfo(APP_INFO, next),
    }),
  )
  assert.deepEqual(result, {
    version: '0.4.2',
    versionCode: 2,
    suffix: 'testnet',
    tag: 'v0.4.2-testnet',
    apk: '0.4.2-testnet.apk',
  })
})

// --- the gate (positive) --------------------------------------------------

test('assertVersionsConsistent passes on the aligned fixture', () => {
  assert.deepEqual(assertVersionsConsistent(sources()), {
    version: V,
    versionCode: 1,
    suffix: SUFFIX,
    tag: 'v0.4.1-devnet',
    apk: '0.4.1-devnet.apk',
  })
})

// --- the gate (negative: one file at a time) ------------------------------

test('rejects an app.json version that is not semver', () => {
  const bad = APP_JSON.replace(`"${V}"`, '"v0.4.1"')
  assert.throws(() => assertVersionsConsistent(sources({ appJson: bad })), /not a valid x\.y\.z/)
})

test('rejects a missing versionCode', () => {
  const bad = JSON.stringify({ expo: { version: V, ios: { buildNumber: '1' } } })
  assert.throws(
    () => assertVersionsConsistent(sources({ appJson: bad })),
    /versionCode must be a positive integer/,
  )
})

test('rejects a non-integer or zero versionCode', () => {
  for (const code of [0, -1, 1.5, '1']) {
    const bad = JSON.stringify({
      expo: { version: V, android: { versionCode: code }, ios: { buildNumber: '1' } },
    })
    assert.throws(
      () => assertVersionsConsistent(sources({ appJson: bad })),
      /versionCode must be a positive integer/,
      `expected rejection for versionCode ${JSON.stringify(code)}`,
    )
  }
})

test('rejects a buildNumber that drifted from versionCode', () => {
  const bad = APP_JSON.replace('"buildNumber": "1"', '"buildNumber": "2"')
  assert.throws(() => assertVersionsConsistent(sources({ appJson: bad })), /buildNumber "2"/)
})

test('rejects a missing buildNumber', () => {
  const bad = JSON.stringify({ expo: { version: V, android: { versionCode: 1 } } })
  assert.throws(() => assertVersionsConsistent(sources({ appJson: bad })), /buildNumber/)
})

test('rejects a stale apps/mobile/package.json version', () => {
  const bad = JSON.stringify({ name: 'tenda-mobile', version: '1.0.0' })
  assert.throws(
    () => assertVersionsConsistent(sources({ pkg: bad })),
    /package\.json version "1\.0\.0" !== app\.json "0\.4\.1"/,
  )
})

test('rejects an app-info release that is not v<x.y.z>', () => {
  const bad = APP_INFO.replace("'v0.4.1-devnet'", "'0.4.1-devnet'")
  assert.throws(
    () => assertVersionsConsistent(sources({ appInfo: bad })),
    /is not v<x\.y\.z>\[-suffix\]/,
  )
})

test('rejects an app-info version that disagrees with app.json', () => {
  const bad = APP_INFO.replace("'v0.4.1-devnet'", "'v0.4.2-devnet'")
  assert.throws(() => assertVersionsConsistent(sources({ appInfo: bad })), /!== app\.json "0\.4\.1"/)
})

// The two halves of the download URL fail independently — this is the pair the
// gate exists for, since a wrong tag and a wrong filename are both a 404 and
// neither is visible from anywhere else in the repo.

test('rejects an apkUrl whose TAG segment is stale', () => {
  const bad = APP_INFO.replace('download/v0.4.1-devnet/', 'download/v0.4.0-devnet/')
  assert.throws(() => assertVersionsConsistent(sources({ appInfo: bad })), /apkUrl tag/)
})

test('rejects an apkUrl whose FILENAME segment is stale', () => {
  const bad = APP_INFO.replace('/0.4.1-devnet.apk', '/0.4.0-devnet.apk')
  assert.throws(() => assertVersionsConsistent(sources({ appInfo: bad })), /apkUrl file/)
})

test('rejects an apkUrl whose suffix disagrees with the release suffix', () => {
  const bad = APP_INFO.replace(URL_041, `${BASE}/releases/download/v0.4.1-testnet/0.4.1-testnet.apk`)
  assert.throws(() => assertVersionsConsistent(sources({ appInfo: bad })), /apkUrl tag/)
})

test('rejects an apkUrl using the tag format for the filename', () => {
  const bad = APP_INFO.replace('/0.4.1-devnet.apk', '/v0.4.1-devnet.apk')
  assert.throws(() => assertVersionsConsistent(sources({ appInfo: bad })), /apkUrl file/)
})
