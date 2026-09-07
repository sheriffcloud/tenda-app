#!/usr/bin/env node
/**
 * check-app-version.mjs
 *
 * Asserts the app version is identical across app.json (the source of truth),
 * apps/mobile/package.json and the landing page's app-info.ts — including both
 * halves of the APK download URL, whose tag and filename use different formats
 * and can go stale independently.
 *
 * Then asserts the two config files that could quietly ignore all of that
 * haven't started to: app.config.ts must keep delegating to app.json, and
 * eas.json must keep versioning on this side rather than on the build machine.
 *
 * Runs on pre-commit (scoped to those files) and in CI on every PR. Exits
 * non-zero on any mismatch.
 *
 * Usage:  node scripts/check-app-version.mjs
 */

import { assertVersionsConsistent } from './lib/version.mjs'
import {
  assertConfigDelegatesVersion,
  assertEasDefersVersioning,
} from './lib/version-delegation.mjs'
import {
  readVersionSources,
  readAppConfig,
  readEasJson,
  VERSION_FILES,
} from './lib/version-files.mjs'

try {
  const { version, versionCode, tag, apk } = assertVersionsConsistent(readVersionSources().sources)
  // Agreeing files are worthless if the build stopped reading them.
  assertConfigDelegatesVersion(readAppConfig())
  assertEasDefersVersioning(readEasJson())

  console.log(`✓ app version consistent across ${Object.values(VERSION_FILES).length} files`)
  console.log(`  ${version} (versionCode ${versionCode}) → tag ${tag}, asset ${apk}`)
  console.log('✓ app.config.ts delegates version + versionCode/buildNumber to app.json')
  console.log('✓ eas.json leaves versioning to bump-version.mjs')
} catch (err) {
  console.error(`✗ ${err.message}`)
  console.error('  run `pnpm bump:version <patch|minor|major>` rather than editing by hand')
  process.exit(1)
}
