/**
 * The I/O half of the version machinery — where the three version files live
 * and how to read/write them. Deliberately the ONLY module here that touches
 * the filesystem: version.mjs and version-plan.mjs stay pure, and the two CLIs
 * share this so `bump-version` and `check-app-version` cannot end up pointed at
 * different files.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseVersionSources } from './version-plan.mjs'

/** Monorepo root, resolved from this file rather than the caller's cwd. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * Every file carrying the app version. Adding one here is all it takes for both
 * the bump and the gate to cover it.
 */
export const VERSION_FILES = /** @type {const} */ ({
  /** SOURCE OF TRUTH — semver, Android versionCode, iOS buildNumber. */
  appJson: 'apps/mobile/app.json',
  /** Expo's `exp.version ?? pkg.version` fallback reads this. */
  pkg: 'apps/mobile/package.json',
  /** Landing-page copy + the APK download URL. */
  appInfo: 'apps/tendahq/src/content/app-info.ts',
})

/**
 * Checked but never rewritten, so it is not part of VERSION_FILES: the bump
 * has nothing to change here. It only has to keep DELEGATING to app.json —
 * see assertConfigDelegatesVersion.
 */
export const APP_CONFIG_FILE = 'apps/mobile/app.config.ts'

/**
 * Also checked but never rewritten: eas.json must keep DEFERRING versioning to
 * this repo rather than bumping on the build machine.
 */
export const EAS_JSON_FILE = 'apps/mobile/eas.json'

/** @param {string} [root] */
export function readAppConfig(root = ROOT) {
  return readFileSync(resolve(root, APP_CONFIG_FILE), 'utf8')
}

/** @param {string} [root] */
export function readEasJson(root = ROOT) {
  return readFileSync(resolve(root, EAS_JSON_FILE), 'utf8')
}

/**
 * `root` is a parameter rather than a constant so the read/rewrite/write cycle
 * can be exercised against a scratch directory — the alternative is either
 * mocking fs (which tests the mock) or writing to the working tree from a test.
 *
 * @param {string} [root]
 * @returns {{ texts: import('./version-plan.mjs').VersionTexts,
 *   sources: ReturnType<typeof parseVersionSources> }}
 */
export function readVersionSources(root = ROOT) {
  const texts = /** @type {import('./version-plan.mjs').VersionTexts} */ ({})
  for (const [key, rel] of Object.entries(VERSION_FILES)) {
    texts[key] = readFileSync(resolve(root, rel), 'utf8')
  }
  return { texts, sources: parseVersionSources(texts) }
}

/**
 * @param {import('./version-plan.mjs').VersionTexts} texts
 * @param {string} [root]
 */
export function writeVersionSources(texts, root = ROOT) {
  for (const [key, rel] of Object.entries(VERSION_FILES)) {
    writeFileSync(resolve(root, rel), texts[key])
  }
}
