/**
 * Release-string helpers.
 *
 * `scripts/bump-version.mjs` owns the version literal and stamps a release
 * qualifier onto it (`v0.4.3-testnet`, or no suffix at all for a plain
 * `v1.0.0`). That suffix is therefore the authoritative answer to "which
 * network is this build talking to", and these two functions are how the page
 * reads it instead of restating it.
 *
 * They live in lib/ rather than inside content/app-info.ts because the branch
 * that matters most — the no-suffix MAINNET path — is the one that has never
 * run in production, and a helper buried in a module-scope object literal
 * cannot be tested before the day it has to be right.
 */

/** Index of the qualifier separator, or -1 when the version carries none. */
function suffixStart(version: string): number {
  return version.indexOf('-')
}

/**
 * Which network the build talks to: `v0.4.3-testnet` → `testnet release`,
 * `v1.0.0` → `mainnet`.
 *
 * Lower-case on purpose — every call site sets it mid-sentence or in
 * parentheses, so a capitalised value would read as a typo in one of the two
 * states rather than in neither.
 */
export function releaseStage(version: string): string {
  const dash = suffixStart(version)
  return dash === -1 ? 'mainnet' : `${version.slice(dash + 1)} release`
}

/** The version without its qualifier: `v0.4.3-testnet` → `v0.4.3`. */
export function versionNumber(version: string): string {
  const dash = suffixStart(version)
  return dash === -1 ? version : version.slice(0, dash)
}
