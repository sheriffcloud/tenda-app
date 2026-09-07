import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertConfigDelegatesVersion,
  assertEasDefersVersioning,
} from './version-delegation.mjs'

// --- app.config.ts delegation ---------------------------------------------

/** A minimal app.config.ts in the shape the real one uses. */
const APP_CONFIG = [
  "import { ExpoConfig, ConfigContext } from 'expo/config'",
  '',
  '/**',
  ' * Version fields are deliberately ABSENT. Writing  version: \'0.0.1\'  here,',
  ' * or  versionCode: 5  in the android block, overrides app.json outright.',
  ' */',
  'export default ({ config }: ConfigContext): ExpoConfig => ({',
  '  ...config,',
  "  name: 'Tenda',",
  '  ios: {',
  '    ...config.ios,',
  '    supportsTablet: true,',
  '  },',
  '  android: {',
  '    ...config.android,',
  "    package: 'com.tendahq.mobile',",
  '  },',
  '  plugins: [',
  // Contains a lowercase `version` with no colon — a checker that matched the
  // bare word instead of the key would reject this legitimate file.
  "    './plugins/with-version-guard',",
  "    ['@sentry/react-native/expo', { url: 'https://sentry.io/' }],",
  '  ],',
  '})',
].join('\n')

test('assertConfigDelegatesVersion passes on a delegating config', () => {
  assert.equal(assertConfigDelegatesVersion(APP_CONFIG), true)
})

test('a literal `version:` inside a COMMENT does not trip the check', () => {
  // The fixture's header spells out both keys verbatim — the real file
  // documents them the same way. A checker that flagged its own documentation
  // would be turned off within a day, so this must actually be exercised: the
  // comment below is the thing comment-stripping exists for.
  assert.match(APP_CONFIG, /\* .*version: '0\.0\.1'/)
  assert.match(APP_CONFIG, /\* .*versionCode: 5/)
  assert.equal(assertConfigDelegatesVersion(APP_CONFIG), true)
})

test('a lowercase `version` in a plugin path does not trip the check', () => {
  // Discriminates matching the KEY from matching the word anywhere.
  assert.ok(APP_CONFIG.includes('with-version-guard'))
  assert.equal(assertConfigDelegatesVersion(APP_CONFIG), true)
})

test('rejects a hardcoded versionCode in the android block', () => {
  // The more tempting mistake than a top-level `version:`, since the spread it
  // defeats is on the line directly above.
  const bad = APP_CONFIG.replace('    ...config.android,', '    ...config.android,\n    versionCode: 5,')
  assert.throws(() => assertConfigDelegatesVersion(bad), /declares a `versionCode:` key/)
})

test('rejects a hardcoded buildNumber in the ios block', () => {
  const bad = APP_CONFIG.replace('    ...config.ios,', "    ...config.ios,\n    buildNumber: '5',")
  assert.throws(() => assertConfigDelegatesVersion(bad), /declares a `buildNumber:` key/)
})

test('a `//` inside a URL is not treated as a comment', () => {
  assert.ok(APP_CONFIG.includes('https://sentry.io/'))
  assert.equal(assertConfigDelegatesVersion(APP_CONFIG), true)
})

test('rejects a re-added version: key', () => {
  const bad = APP_CONFIG.replace("  name: 'Tenda',", "  name: 'Tenda',\n  version: '0.0.1',")
  assert.throws(() => assertConfigDelegatesVersion(bad), /declares a `version:` key/)
})

test('rejects a dropped android spread (versionCode silently stuck at 1)', () => {
  const bad = APP_CONFIG.replace('    ...config.android,\n', '')
  assert.throws(() => assertConfigDelegatesVersion(bad), /missing `\.\.\.config\.android`.*versionCode/s)
})

test('rejects a dropped ios spread', () => {
  const bad = APP_CONFIG.replace('    ...config.ios,\n', '')
  assert.throws(() => assertConfigDelegatesVersion(bad), /missing `\.\.\.config\.ios`.*buildNumber/s)
})

test('versionCode: and runtimeVersion: keys are not mistaken for version:', () => {
  // No word boundary before `version` in either, so the key regex must not fire.
  const ok = APP_CONFIG.replace("  name: 'Tenda',", "  name: 'Tenda',\n  runtimeVersion: '1.0.0',")
  assert.equal(assertConfigDelegatesVersion(ok), true)
})


// --- eas.json versioning ownership ----------------------------------------

/** The real eas.json's shape, minus the parts versioning doesn't touch. */
const EAS = JSON.stringify(
  {
    cli: { version: '>= 12.0.0', appVersionSource: 'local' },
    build: {
      development: { env: { APP_ENV: 'development' }, android: { buildType: 'apk' } },
      preview: { env: { APP_ENV: 'staging' }, android: { buildType: 'apk' } },
      testnet: { extends: 'preview' },
      production: { env: { APP_ENV: 'production' }, android: { buildType: 'app-bundle' } },
    },
  },
  null,
  2,
)

test('assertEasDefersVersioning passes on a config that owns no versions', () => {
  assert.equal(assertEasDefersVersioning(EAS), true)
})

/**
 * The regression this check exists for, and it is subtle: eas-cli REFUSES
 * autoIncrement on a project with only a dynamic config, so before app.json
 * existed this option was self-blocking. Adding app.json satisfied that guard,
 * turning a loud error into a silent double-bump — EAS bumps versionCode on the
 * build machine, the runner discards the edit, and the uploaded binary and the
 * committed repo disagree forever.
 */
test('rejects autoIncrement on any profile', () => {
  for (const profile of ['production', 'preview', 'testnet', 'development']) {
    const eas = JSON.parse(EAS)
    eas.build[profile].autoIncrement = true
    assert.throws(
      () => assertEasDefersVersioning(JSON.stringify(eas)),
      new RegExp(`profile "${profile}" sets autoIncrement`),
      `expected rejection for ${profile}`,
    )
  }
})

test('rejects autoIncrement even when it is false or a string', () => {
  // `false` is harmless today but declares EAS as the owner, and any string
  // (e.g. "version") silently switches WHICH number EAS bumps.
  for (const value of [false, 'version', 'versionCode']) {
    const eas = JSON.parse(EAS)
    eas.build.production.autoIncrement = value
    assert.throws(
      () => assertEasDefersVersioning(JSON.stringify(eas)),
      /sets autoIncrement/,
      `expected rejection for ${JSON.stringify(value)}`,
    )
  }
})

test('rejects appVersionSource "remote" — it makes app.json decorative', () => {
  const eas = JSON.parse(EAS)
  eas.cli.appVersionSource = 'remote'
  assert.throws(() => assertEasDefersVersioning(JSON.stringify(eas)), /must be "local"/)
})

test('rejects a MISSING appVersionSource rather than assuming a default', () => {
  // Newer eas-cli defaults this to "remote", so silence is not safety.
  const eas = JSON.parse(EAS)
  delete eas.cli.appVersionSource
  assert.throws(() => assertEasDefersVersioning(JSON.stringify(eas)), /must be "local", got undefined/)
})

test('tolerates an eas.json with no build profiles at all', () => {
  assert.equal(
    assertEasDefersVersioning(JSON.stringify({ cli: { appVersionSource: 'local' } })),
    true,
  )
})
