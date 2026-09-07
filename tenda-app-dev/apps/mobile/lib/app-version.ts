import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { APP_INFO } from '@tenda/shared'

/**
 * The running build's identity, read from the embedded Expo manifest.
 *
 * The manifest is generated from apps/mobile/app.json, which is also what
 * `scripts/bump-version.mjs` writes and the release tag is cut from — so what
 * this shows and what shipped cannot disagree. The screens previously printed a
 * hardcoded "Tenda v1.0.0" while the binary identified itself to Android as
 * 0.0.1, which made every support report's version line worthless.
 *
 * The build number is included because it, not the semver, is what distinguishes
 * two builds of the same release — which is exactly the question a bug report
 * needs answered.
 */
export interface AppVersionInfo {
  /** Semver from app.json, or null when the manifest is unavailable. */
  version: string | null
  /** Android versionCode / iOS buildNumber, normalised to a string, or null. */
  build: string | null
  /** Ready-to-render label, e.g. `Tenda v0.4.1 (1)`. */
  label: string
}

/**
 * Degrades rather than guesses: an unknown version drops out of the label
 * instead of being replaced by a plausible-looking default. A wrong version is
 * worse than an absent one — it sends whoever reads it to the wrong build.
 */
export function formatVersionLabel(version: string | null, build: string | null): string {
  if (version === null) return APP_INFO.name
  if (build === null) return `${APP_INFO.name} v${version}`
  return `${APP_INFO.name} v${version} (${build})`
}

export function getAppVersion(): AppVersionInfo {
  const expo = Constants.expoConfig
  // The two platforms disagree on both the field name and the type —
  // `versionCode` is a number, `buildNumber` a string — so normalise here
  // rather than leaving a union for every caller to narrow.
  const native = Platform.OS === 'ios' ? expo?.ios?.buildNumber : expo?.android?.versionCode

  const version = typeof expo?.version === 'string' ? expo.version : null
  const build = native === undefined || native === null ? null : String(native)

  return { version, build, label: formatVersionLabel(version, build) }
}
