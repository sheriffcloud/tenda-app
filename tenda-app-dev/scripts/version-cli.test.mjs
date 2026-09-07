/**
 * End-to-end tests for the two version CLIs, run as real subprocesses.
 *
 * Everything below the CLI is pure and unit-tested; what is left in the
 * wrappers is exactly what a unit test cannot reach — exit codes, stdout shape,
 * and the one branch that decides whether the disk is touched at all. That
 * branch matters more than its size suggests: inverting `!values['dry-run']`
 * turns `--dry-run` into a silent rewrite, and every other test in this repo
 * would still pass.
 *
 * The whole `scripts/` directory is copied into a scratch root, so ROOT (which
 * resolves from the script's own location) lands there and the REAL shipped
 * code runs against fixture files instead of the working tree.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { ROOT, VERSION_FILES, APP_CONFIG_FILE, EAS_JSON_FILE } from './lib/version-files.mjs'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))
const BASE = 'https://github.com/wisdomabioye/tenda-app'

const FIXTURE = {
  appJson: `${JSON.stringify(
    { expo: { version: '0.4.1', android: { versionCode: 1 }, ios: { buildNumber: '1' } } },
    null,
    2,
  )}\n`,
  pkg: `${JSON.stringify({ name: 'tenda-mobile', version: '0.4.1' }, null, 2)}\n`,
  appInfo: [
    'export const APP_INFO = {',
    `  apkUrl: '${BASE}/releases/download/v0.4.1-devnet/0.4.1-devnet.apk',`,
    "  version: 'v0.4.1-devnet',",
    '} as const',
    '',
  ].join('\n'),
}

/**
 * Both are checked by the gate but never rewritten by the bump, so they are
 * seeded separately from FIXTURE — which is what `repo.read()` diffs.
 */
const EAS_JSON = `${JSON.stringify(
  { cli: { appVersionSource: 'local' }, build: { testnet: { extends: 'preview' } } },
  null,
  2,
)}\n`

const APP_CONFIG = [
  'export default ({ config }: ConfigContext): ExpoConfig => ({',
  '  ...config,',
  "  name: 'Tenda',",
  '  ios: { ...config.ios, supportsTablet: true },',
  "  android: { ...config.android, package: 'com.tendahq.mobile' },",
  '})',
  '',
].join('\n')

/** A throwaway monorepo carrying the real scripts and the fixture files. */
function scratchRepo(t, files = FIXTURE, appConfig = APP_CONFIG, easJson = EAS_JSON) {
  const root = mkdtempSync(resolve(tmpdir(), 'tenda-cli-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  cpSync(SCRIPTS, resolve(root, 'scripts'), { recursive: true })
  for (const [key, rel] of Object.entries(VERSION_FILES)) {
    mkdirSync(dirname(resolve(root, rel)), { recursive: true })
    writeFileSync(resolve(root, rel), files[key])
  }
  mkdirSync(dirname(resolve(root, APP_CONFIG_FILE)), { recursive: true })
  writeFileSync(resolve(root, APP_CONFIG_FILE), appConfig)
  mkdirSync(dirname(resolve(root, EAS_JSON_FILE)), { recursive: true })
  writeFileSync(resolve(root, EAS_JSON_FILE), easJson)
  return {
    root,
    run: (script, args = []) => {
      const r = spawnSync(process.execPath, [resolve(root, 'scripts', script), ...args], {
        encoding: 'utf8',
      })
      return { status: r.status, stdout: r.stdout, stderr: r.stderr }
    },
    read: () =>
      Object.fromEntries(
        Object.entries(VERSION_FILES).map(([key, rel]) => [
          key,
          readFileSync(resolve(root, rel), 'utf8'),
        ]),
      ),
  }
}

// --- check-app-version ----------------------------------------------------

test('check-app-version exits 0 and reports the release on a consistent repo', (t) => {
  const repo = scratchRepo(t)
  const { status, stdout } = repo.run('check-app-version.mjs')
  assert.equal(status, 0)
  assert.match(stdout, /✓ app version consistent/)
  assert.match(stdout, /v0\.4\.1-devnet/)
})

test('check-app-version exits 1 and names the offending file on drift', (t) => {
  const repo = scratchRepo(t, {
    ...FIXTURE,
    pkg: `${JSON.stringify({ name: 'tenda-mobile', version: '9.9.9' }, null, 2)}\n`,
  })
  const { status, stderr } = repo.run('check-app-version.mjs')
  assert.equal(status, 1, 'a drifted repo must fail the gate')
  assert.match(stderr, /package\.json version "9\.9\.9"/)
})

/**
 * Three files can agree perfectly while the build ignores all of them. These
 * two edits are invisible to a diff review, a type-check and every render test
 * — before this check the only way to catch them was reading
 * `npx expo config --type public` by eye.
 */
test('check-app-version exits 1 when app.config.ts re-declares version', (t) => {
  const repo = scratchRepo(t, FIXTURE, APP_CONFIG.replace("  name: 'Tenda',", "  version: '0.0.1',"))
  const { status, stderr } = repo.run('check-app-version.mjs')
  assert.equal(status, 1)
  assert.match(stderr, /declares a `version:` key/)
})

test('check-app-version exits 1 when app.config.ts drops the android spread', (t) => {
  const repo = scratchRepo(t, FIXTURE, APP_CONFIG.replace('...config.android, ', ''))
  const { status, stderr } = repo.run('check-app-version.mjs')
  assert.equal(status, 1)
  assert.match(stderr, /missing `\.\.\.config\.android`/)
  assert.match(stderr, /versionCode/)
})

/**
 * The trap the single-sourcing work itself sprang: eas-cli refuses
 * `autoIncrement` on a project with only a dynamic config, so before app.json
 * existed the option was self-blocking. Creating app.json satisfied that guard,
 * so re-adding it now WORKS — EAS bumps versionCode on the build machine, the
 * runner discards the edit, and the uploaded binary permanently disagrees with
 * the committed repo.
 */
test('check-app-version exits 1 when eas.json re-enables autoIncrement', (t) => {
  const eas = JSON.parse(EAS_JSON)
  eas.build.production = { autoIncrement: true }
  const repo = scratchRepo(t, FIXTURE, APP_CONFIG, JSON.stringify(eas, null, 2))
  const { status, stderr } = repo.run('check-app-version.mjs')
  assert.equal(status, 1)
  assert.match(stderr, /profile "production" sets autoIncrement/)
})

test('check-app-version exits 1 when eas.json moves versioning to EAS', (t) => {
  const eas = JSON.parse(EAS_JSON)
  eas.cli.appVersionSource = 'remote'
  const repo = scratchRepo(t, FIXTURE, APP_CONFIG, JSON.stringify(eas, null, 2))
  const { status, stderr } = repo.run('check-app-version.mjs')
  assert.equal(status, 1)
  assert.match(stderr, /appVersionSource must be "local"/)
})

test('check-app-version exits 1 when a version file is missing entirely', (t) => {
  const repo = scratchRepo(t)
  rmSync(resolve(repo.root, VERSION_FILES.appJson))
  const { status, stderr } = repo.run('check-app-version.mjs')
  assert.equal(status, 1)
  assert.match(stderr, /ENOENT|no such file/)
})

// --- bump-version: the write decision -------------------------------------

test('--dry-run writes NOTHING', (t) => {
  const repo = scratchRepo(t)
  const before = repo.read()
  const { status, stdout } = repo.run('bump-version.mjs', ['patch', '--dry-run'])
  assert.equal(status, 0)
  assert.match(stdout, /would bump/)
  assert.deepEqual(repo.read(), before, '--dry-run must leave every file byte-identical')
})

test('a real bump writes all three files', (t) => {
  const repo = scratchRepo(t)
  const { status, stdout } = repo.run('bump-version.mjs', ['patch', '--suffix', 'testnet'])
  assert.equal(status, 0)
  assert.match(stdout, /✓ bumped 0\.4\.1 → 0\.4\.2/)

  const after = repo.read()
  assert.match(after.appJson, /"version": "0\.4\.2"/)
  assert.match(after.appJson, /"versionCode": 2/)
  assert.match(after.appJson, /"buildNumber": "2"/)
  assert.match(after.pkg, /"version": "0\.4\.2"/)
  assert.match(after.appInfo, /version: 'v0\.4\.2-testnet'/)
  assert.match(after.appInfo, /download\/v0\.4\.2-testnet\/0\.4\.2-testnet\.apk/)

  // And the repo it leaves behind passes its own gate.
  assert.equal(repo.run('check-app-version.mjs').status, 0)
})

test('a bump touches nothing but the version fields', (t) => {
  const repo = scratchRepo(t)
  const before = repo.read()
  assert.equal(repo.run('bump-version.mjs', ['patch']).status, 0)
  const after = repo.read()

  // The surgical rewrite claim, checked byte-wise: same line count, and every
  // differing line mentions a version.
  for (const key of Object.keys(before)) {
    const b = before[key].split('\n')
    const a = after[key].split('\n')
    assert.equal(a.length, b.length, `${key}: line count changed`)

    const changed = b.map((_, i) => i).filter((i) => a[i] !== b[i])
    // Without this the test is vacuous: a bump that wrote NOTHING has no
    // differing lines, so the loop below would assert nothing and pass.
    assert.ok(changed.length > 0, `${key}: bump changed nothing`)
    for (const i of changed) {
      assert.match(a[i], /0\.4\.2|versionCode|buildNumber/, `${key} line ${i} is not a version line`)
    }
  }
})

// --- bump-version: refusals leave the disk alone --------------------------

test('a bump from a drifted repo exits 1 and writes nothing', (t) => {
  const drifted = {
    ...FIXTURE,
    pkg: `${JSON.stringify({ name: 'tenda-mobile', version: '9.9.9' }, null, 2)}\n`,
  }
  const repo = scratchRepo(t, drifted)
  const before = repo.read()
  const { status, stderr } = repo.run('bump-version.mjs', ['patch'])
  assert.equal(status, 1)
  assert.match(stderr, /!== app\.json/)
  assert.deepEqual(repo.read(), before, 'a refused bump must not partially write')
})

test('an invalid bump kind exits 1 and writes nothing', (t) => {
  const repo = scratchRepo(t)
  const before = repo.read()
  const { status, stderr } = repo.run('bump-version.mjs', ['pacth'])
  assert.equal(status, 1)
  assert.match(stderr, /unknown bump/)
  assert.deepEqual(repo.read(), before)
})

test('a missing bump kind exits 1 with usage', (t) => {
  const repo = scratchRepo(t)
  const { status, stderr } = repo.run('bump-version.mjs')
  assert.equal(status, 1)
  assert.match(stderr, /usage: node scripts\/bump-version\.mjs/)
})

test('an unknown flag exits 1 with usage instead of a stack trace', (t) => {
  const repo = scratchRepo(t)
  const { status, stderr } = repo.run('bump-version.mjs', ['patch', '--sufix', 'testnet'])
  assert.equal(status, 1)
  assert.match(stderr, /Unknown option/)
  assert.match(stderr, /usage:/)
  assert.doesNotMatch(stderr, /at \w+ \(node:/, 'operators should not be shown a stack trace')
})

// --- bump-version: machine-readable output --------------------------------

test('--json prints only the result object, for the release workflow to read', (t) => {
  const repo = scratchRepo(t)
  const { status, stdout } = repo.run('bump-version.mjs', [
    'minor',
    '--suffix',
    'testnet',
    '--dry-run',
    '--json',
  ])
  assert.equal(status, 0)
  assert.deepEqual(JSON.parse(stdout), {
    version: '0.5.0',
    versionCode: 2,
    suffix: 'testnet',
    tag: 'v0.5.0-testnet',
    apk: '0.5.0-testnet.apk',
  })
})

test('--json survives an empty suffix (the plain v1.0.0 release)', (t) => {
  const repo = scratchRepo(t)
  const { status, stdout } = repo.run('bump-version.mjs', [
    'major',
    '--suffix',
    '',
    '--dry-run',
    '--json',
  ])
  assert.equal(status, 0)
  assert.deepEqual(JSON.parse(stdout), {
    version: '1.0.0',
    versionCode: 2,
    suffix: '',
    tag: 'v1.0.0',
    apk: '1.0.0.apk',
  })
})

/**
 * The isolation these tests rest on, asserted rather than assumed. Every other
 * test here reads back from the scratch root, so a CLI that resolved its root
 * to the WORKING TREE would fail them — but only after having already rewritten
 * the real apps/mobile and apps/tendahq files. This checks the real repo
 * directly, so that failure mode is named rather than inferred from collateral
 * damage.
 */
test('a scratch bump leaves the real working tree untouched', (t) => {
  const realBefore = Object.fromEntries(
    Object.entries(VERSION_FILES).map(([k, rel]) => [k, readFileSync(resolve(ROOT, rel), 'utf8')]),
  )
  const repo = scratchRepo(t)
  assert.equal(repo.run('bump-version.mjs', ['major', '--suffix', 'leaked']).status, 0)

  for (const [key, rel] of Object.entries(VERSION_FILES)) {
    assert.equal(
      readFileSync(resolve(ROOT, rel), 'utf8'),
      realBefore[key],
      `${rel} was modified by a bump that should have been confined to ${repo.root}`,
    )
  }
})

test('consecutive bumps keep the versionCode monotonic', (t) => {
  const repo = scratchRepo(t)
  const codes = []
  for (const kind of ['patch', 'patch', 'minor', 'major']) {
    const { status, stdout } = repo.run('bump-version.mjs', [kind, '--json'])
    assert.equal(status, 0, stdout)
    codes.push(JSON.parse(stdout).versionCode)
  }
  assert.deepEqual(codes, [2, 3, 4, 5], 'each release must claim a fresh, higher versionCode')
})
