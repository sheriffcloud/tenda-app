/**
 * End-to-end tests for the release CLIs, run as real subprocesses.
 *
 * These three scripts exist specifically so the release workflow contains no
 * untested logic, so testing them the way the workflow invokes them — argv in,
 * stdout/exit-code out — is the whole point. In particular stdout must stay
 * machine-clean: the workflow captures it into a shell variable and into
 * $GITHUB_OUTPUT, so a stray progress line becomes a corrupt tag or a URL with
 * a log message glued to it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { parseAppInfo } from './lib/version.mjs'
import { readVersionSources } from './lib/version-files.mjs'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))

const run = (script, args = []) => {
  const r = spawnSync(process.execPath, [resolve(SCRIPTS, script), ...args], { encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr }
}

/** Write `content` to a scratch file and return its path. */
function fixture(t, name, content) {
  const dir = mkdtempSync(resolve(tmpdir(), 'tenda-release-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const path = resolve(dir, name)
  writeFileSync(path, content)
  return path
}

const ARTIFACT = 'https://expo.dev/artifacts/eas/abc123.apk'
const FINISHED = JSON.stringify([
  { id: 'b-1', status: 'FINISHED', platform: 'ANDROID', artifacts: { applicationArchiveUrl: ARTIFACT } },
])
const BUMP = JSON.stringify({
  version: '0.4.2',
  versionCode: 2,
  suffix: 'testnet',
  tag: 'v0.4.2-testnet',
  apk: '0.4.2-testnet.apk',
})

// --- release-artifact.mjs -------------------------------------------------

test('release-artifact prints ONLY the URL on stdout', (t) => {
  const { status, stdout, stderr } = run('release-artifact.mjs', [
    fixture(t, 'build.json', FINISHED),
  ])
  assert.equal(status, 0)
  // The workflow does URL="$(...)" — anything else on stdout ends up in curl.
  assert.equal(stdout, `${ARTIFACT}\n`)
  assert.match(stderr, /build b-1 \(ANDROID\) finished/)
})

test('release-artifact reads stdin with -', (t) => {
  const r = spawnSync(process.execPath, [resolve(SCRIPTS, 'release-artifact.mjs'), '-'], {
    encoding: 'utf8',
    input: FINISHED,
  })
  assert.equal(r.status, 0)
  assert.equal(r.stdout, `${ARTIFACT}\n`)
})

test('release-artifact exits 1 on a CANCELED build and prints no URL', (t) => {
  const cancelled = JSON.stringify([{ id: 'b-2', status: 'CANCELED', artifacts: {} }])
  const { status, stdout, stderr } = run('release-artifact.mjs', [
    fixture(t, 'build.json', cancelled),
  ])
  assert.equal(status, 1, 'eas-cli exits 0 for CANCELED — this must not')
  assert.equal(stdout, '', 'a failed parse must not put anything on stdout')
  assert.match(stderr, /is CANCELED, not FINISHED/)
})

test('release-artifact exits 1 rather than emitting "null" like jq would', (t) => {
  const nulled = JSON.stringify([
    { id: 'b-3', status: 'FINISHED', artifacts: { applicationArchiveUrl: null } },
  ])
  const { status, stdout } = run('release-artifact.mjs', [fixture(t, 'build.json', nulled)])
  assert.equal(status, 1)
  assert.doesNotMatch(stdout, /null/)
  assert.equal(stdout, '')
})

test('release-artifact exits 1 with usage when given no argument', () => {
  const { status, stderr } = run('release-artifact.mjs')
  assert.equal(status, 1)
  assert.match(stderr, /usage:/)
})

test('release-artifact exits 1 when the file does not exist', () => {
  const { status, stderr } = run('release-artifact.mjs', ['/nope/build.json'])
  assert.equal(status, 1)
  assert.match(stderr, /ENOENT|no such file/)
})

// --- release-outputs.mjs --------------------------------------------------

test('release-outputs emits exactly the four key=value lines', (t) => {
  const { status, stdout, stderr } = run('release-outputs.mjs', [fixture(t, 'bump.json', BUMP)])
  assert.equal(status, 0)
  assert.equal(
    stdout,
    'version=0.4.2\nversionCode=2\ntag=v0.4.2-testnet\napk=0.4.2-testnet.apk\n',
  )
  assert.match(stderr, /0\.4\.2 \(versionCode 2\)/)
})

test('release-outputs stdout is valid GITHUB_OUTPUT syntax', (t) => {
  const { stdout } = run('release-outputs.mjs', [fixture(t, 'bump.json', BUMP)])
  const lines = stdout.trimEnd().split('\n')
  assert.equal(lines.length, 4, 'expected exactly the four outputs the workflow reads')
  for (const line of lines) {
    // No spaces around `=`, no newlines inside values — GitHub would otherwise
    // silently drop the output or need heredoc delimiters.
    assert.match(line, /^[a-zA-Z][a-zA-Z0-9_]*=[^\s]+$/, `bad output line: ${line}`)
  }
})

test('release-outputs reads stdin with -', () => {
  const r = spawnSync(process.execPath, [resolve(SCRIPTS, 'release-outputs.mjs'), '-'], {
    encoding: 'utf8',
    input: BUMP,
  })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /^version=0\.4\.2$/m)
})

test('release-outputs exits 1 with usage when given no argument', () => {
  const { status, stdout, stderr } = run('release-outputs.mjs')
  assert.equal(status, 1)
  assert.equal(stdout, '')
  assert.match(stderr, /usage:/)
})

test('release-outputs exits 1 on a malformed bump result, emitting nothing', (t) => {
  const bad = JSON.stringify({ version: '0.4.2', versionCode: 0, suffix: '', tag: '', apk: '' })
  const { status, stdout, stderr } = run('release-outputs.mjs', [fixture(t, 'bump.json', bad)])
  assert.equal(status, 1)
  assert.equal(stdout, '', 'a partial write into $GITHUB_OUTPUT is worse than none')
  assert.match(stderr, /versionCode must be a positive integer/)
})

// --- verify-release-url.mjs -----------------------------------------------

/**
 * Runs against the REAL repo, so it also pins that the committed app-info.ts
 * agrees with the tag and asset the current version would produce.
 *
 * Everything is DERIVED from the current app-info.ts rather than written out.
 * Hardcoding `v0.4.1-devnet` here made the suite a time bomb: the first release
 * bumps the repo to 0.4.2 and the "passes" case below starts failing, turning
 * CI red immediately after a successful release for no real reason. A test that
 * has to be edited every release is a test people learn to edit without
 * reading.
 */
const CURRENT = (() => {
  const { apkUrl, apkTag, apkFile } = parseAppInfo(readVersionSources().texts.appInfo)
  const repo = apkUrl.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\//)
  assert.ok(repo, `app-info apkUrl is not a github.com release URL: ${apkUrl}`)
  return { repo: repo[1], tag: apkTag, apk: apkFile }
})()

test('verify-release-url passes for the repo the landing page points at', () => {
  const { status, stdout } = run('verify-release-url.mjs', [
    CURRENT.repo,
    CURRENT.tag,
    CURRENT.apk,
  ])
  assert.equal(status, 0, stdout)
  assert.match(stdout, /already points at this release/)
})

test('verify-release-url exits 1 for a different repository', () => {
  // The failure the version gate structurally cannot see: it derives the repo
  // from the URL already in the file, so a fork or rename passes it and 404s.
  const { status, stderr } = run('verify-release-url.mjs', [
    `not-${CURRENT.repo}`,
    CURRENT.tag,
    CURRENT.apk,
  ])
  assert.equal(status, 1)
  assert.match(stderr, /points somewhere this release will not publish/)
})

test('verify-release-url exits 1 for a tag or asset that is not the current one', () => {
  for (const args of [
    [CURRENT.repo, 'v9.9.9-nope', CURRENT.apk],
    [CURRENT.repo, CURRENT.tag, '9.9.9-nope.apk'],
  ]) {
    const { status, stderr } = run('verify-release-url.mjs', args)
    assert.equal(status, 1, `expected failure for ${args.join(' ')}`)
    assert.match(stderr, /will not publish/)
  }
})

test('verify-release-url exits 1 with usage when under-argued', () => {
  const { status, stderr } = run('verify-release-url.mjs', ['wisdomabioye/tenda-app'])
  assert.equal(status, 1)
  assert.match(stderr, /usage:/)
})
