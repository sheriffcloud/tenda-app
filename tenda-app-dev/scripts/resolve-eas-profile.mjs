#!/usr/bin/env node
/**
 * resolve-eas-profile.mjs
 *
 * Picks the EAS build profile for a release from the release SUFFIX, and
 * refuses to return one that would produce the wrong artifact.
 *
 * WHY THIS EXISTS. The release workflow takes a free-form `suffix` input that
 * decides the tag (`v1.0.0-testnet`) and the asset name — but it passed
 * `--profile testnet` to eas-cli as a HARDCODED literal. So a release cut with
 * `--suffix ''` (the mainnet release) would tag and publish `v1.0.0` while
 * building the **testnet** profile: a staging-configured APK shipped under a
 * mainnet tag, with nothing in the run output that looks wrong.
 *
 * The second trap is subtler. The obvious fix — "use the `production` profile
 * for mainnet" — swaps a wrong app for a wrong FILE: `production` sets
 * `buildType: app-bundle`, and the workflow downloads the artifact to a
 * `.apk` filename and sanity-checks that it starts with `PK`. An .aab is also
 * a zip, so that check passes and the release publishes an app bundle named
 * `.apk`, which no phone can install. Hence the buildType assertion below.
 *
 * Usage:  node scripts/resolve-eas-profile.mjs "<suffix>" >> "$GITHUB_OUTPUT"
 *         (suffix may be empty — that IS the mainnet case)
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EAS_JSON = 'apps/mobile/eas.json'

/** The profile a release with this suffix must build. */
export function profileForSuffix(suffix) {
  if (typeof suffix !== 'string') {
    throw new Error(`suffix must be a string, got ${typeof suffix}`)
  }
  // An empty suffix is the plain `v1.0.0` release — the mainnet build.
  return suffix.trim() === '' ? 'mainnet' : suffix.trim()
}

/**
 * Follow `extends` to the profile's effective `android.buildType`.
 * Depth-guarded: a cycle in eas.json would otherwise hang the release.
 */
export function effectiveBuildType(build, name) {
  const seen = new Set()
  let current = name
  while (current !== undefined) {
    if (seen.has(current)) {
      throw new Error(`eas.json: profile "${name}" has a circular extends chain via "${current}"`)
    }
    seen.add(current)
    const profile = build[current]
    if (profile === undefined) {
      throw new Error(
        `eas.json: profile "${current}" does not exist (available: ${Object.keys(build).join(', ')})`,
      )
    }
    const buildType = profile.android?.buildType
    if (buildType !== undefined) return buildType
    current = profile.extends
  }
  return undefined
}

/**
 * Resolve and validate. Throws with an actionable message rather than
 * returning something the workflow would use anyway.
 */
export function resolveEasProfile(suffix, easJson) {
  const build = easJson?.build
  if (build === undefined || typeof build !== 'object') {
    throw new Error(`${EAS_JSON}: no "build" section`)
  }

  const profile = profileForSuffix(suffix)
  if (build[profile] === undefined) {
    throw new Error(
      `${EAS_JSON}: release suffix "${suffix}" needs a build profile named "${profile}", ` +
        `which does not exist (available: ${Object.keys(build).join(', ')}). ` +
        `Add it to ${EAS_JSON} or cut the release with a suffix that matches an existing profile.`,
    )
  }

  const buildType = effectiveBuildType(build, profile)
  if (buildType !== 'apk') {
    throw new Error(
      `${EAS_JSON}: profile "${profile}" builds "${buildType ?? 'the EAS default'}", not "apk". ` +
        `The release workflow publishes a .apk asset and an app-bundle would be uploaded under ` +
        `that name — installable by nobody. Set android.buildType to "apk" for this profile.`,
    )
  }

  return profile
}

// Execute only when run directly, so the tests can import the pure functions.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // `?? ''` not a required-arg check: an ABSENT argv slot and an empty string
  // both mean "no suffix", which is the mainnet release, not an operator error.
  const suffix = process.argv[2] ?? ''
  try {
    const easJson = JSON.parse(readFileSync(resolve(ROOT, EAS_JSON), 'utf8'))
    const profile = resolveEasProfile(suffix, easJson)
    console.error(`✓ suffix "${suffix}" → EAS profile "${profile}" (apk)`)
    console.log(`profile=${profile}`)
  } catch (err) {
    console.error(`✗ ${err.message}`)
    process.exit(1)
  }
}
