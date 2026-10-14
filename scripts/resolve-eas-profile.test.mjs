/**
 * Tests for resolve-eas-profile.mjs — the guard that stops a release building
 * the wrong app, or the right app in the wrong container.
 *
 * The last case is the one that motivated the script: `production` exists and
 * looks like the obvious mainnet profile, but it builds an app-bundle, and the
 * workflow's own artifact check (`starts with PK`) passes for an .aab. Nothing
 * downstream would catch it, so it has to be caught here.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { profileForSuffix, effectiveBuildType, resolveEasProfile } from './resolve-eas-profile.mjs'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(SCRIPTS, '..')
const SCRIPT = resolve(SCRIPTS, 'resolve-eas-profile.mjs')

/** Run the CLI exactly as the workflow does. */
function runCli(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
}

const FIXTURE = {
  build: {
    preview: { android: { buildType: 'apk' } },
    testnet: { extends: 'preview' },
    mainnet: { android: { buildType: 'apk' } },
    production: { android: { buildType: 'app-bundle' } },
    defaulted: {},
  },
}

test('a suffix names the profile of the same name', () => {
  assert.equal(profileForSuffix('testnet'), 'testnet')
  assert.equal(profileForSuffix('beta'), 'beta')
})

test('an empty or whitespace suffix is the mainnet release', () => {
  assert.equal(profileForSuffix(''), 'mainnet')
  assert.equal(profileForSuffix('   '), 'mainnet')
})

test('a non-string suffix is rejected rather than coerced', () => {
  assert.throws(() => profileForSuffix(undefined), /must be a string/)
  assert.throws(() => profileForSuffix(null), /must be a string/)
})

test('buildType is followed through an extends chain', () => {
  assert.equal(effectiveBuildType(FIXTURE.build, 'testnet'), 'apk')
})

test('a profile with no buildType anywhere in its chain resolves to undefined', () => {
  assert.equal(effectiveBuildType(FIXTURE.build, 'defaulted'), undefined)
})

test('a circular extends chain throws instead of hanging the release', () => {
  const build = { a: { extends: 'b' }, b: { extends: 'a' } }
  assert.throws(() => effectiveBuildType(build, 'a'), /circular extends/)
})

test('an unknown profile in a chain names the missing link', () => {
  const build = { a: { extends: 'ghost' } }
  assert.throws(() => effectiveBuildType(build, 'a'), /"ghost" does not exist/)
})

test('resolves the testnet release to the testnet profile', () => {
  assert.equal(resolveEasProfile('testnet', FIXTURE), 'testnet')
})

test('resolves the plain release to the mainnet profile', () => {
  assert.equal(resolveEasProfile('', FIXTURE), 'mainnet')
})

test('a suffix with no matching profile is refused before the build starts', () => {
  assert.throws(
    () => resolveEasProfile('canary', FIXTURE),
    /needs a build profile named "canary"/,
  )
})

/** The trap this script exists for: right profile name, wrong artifact type. */
test('an app-bundle profile is refused because the workflow publishes an .apk', () => {
  const bundled = { build: { ...FIXTURE.build, mainnet: { android: { buildType: 'app-bundle' } } } }
  assert.throws(() => resolveEasProfile('', bundled), /not "apk"/)
})

test('a profile that never declares a buildType is refused too', () => {
  assert.throws(() => resolveEasProfile('defaulted', FIXTURE), /not "apk"/)
})

test('eas.json with no build section fails with a clear message', () => {
  assert.throws(() => resolveEasProfile('', {}), /no "build" section/)
})

/**
 * Contract test against the real file: both suffixes the project actually
 * ships must resolve today, or a release is already broken and nobody knows.
 */
test('the repo eas.json satisfies both the testnet and the mainnet release', () => {
  const easJson = JSON.parse(readFileSync(resolve(ROOT, 'apps/mobile/eas.json'), 'utf8'))
  assert.equal(resolveEasProfile('testnet', easJson), 'testnet')
  assert.equal(resolveEasProfile('', easJson), 'mainnet')
})

/**
 * The CLI block is what the workflow actually invokes, and nothing above
 * touches it — the pure functions are imported directly. Its siblings
 * (release-cli.test.mjs, version-cli.test.mjs) spawn their scripts for exactly
 * this reason: an entry point guarded by `process.argv[1] === ...` that never
 * matches would emit nothing, leaving the workflow with an EMPTY profile and a
 * `--profile ""` that fails deep inside eas-cli instead of here.
 */
test('the CLI emits a GITHUB_OUTPUT line for the testnet release', () => {
  const r = runCli(['testnet'])
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, 'profile=testnet\n')
  assert.match(r.stderr, /→ EAS profile "testnet"/)
})

test('the CLI resolves an empty suffix to the mainnet profile', () => {
  const r = runCli([''])
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, 'profile=mainnet\n')
})

/** An absent argv slot is the same case as an empty one, not an error. */
test('the CLI treats a missing argument as the mainnet release', () => {
  const r = runCli([])
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, 'profile=mainnet\n')
})

test('the CLI exits non-zero and prints nothing to stdout for an unknown profile', () => {
  const r = runCli(['canary'])
  assert.equal(r.status, 1)
  assert.equal(r.stdout, '', 'a failed resolve must not emit a profile line')
  assert.match(r.stderr, /needs a build profile named "canary"/)
})

/** Every emitted line must be valid GITHUB_OUTPUT syntax: key=value, no spaces. */
test('the CLI output is valid GITHUB_OUTPUT syntax', () => {
  for (const args of [['testnet'], ['']]) {
    const line = runCli(args).stdout.trimEnd()
    assert.match(line, /^[a-zA-Z][a-zA-Z0-9_]*=[^\s]+$/, `bad output line: ${line}`)
  }
})
