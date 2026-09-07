/**
 * What a version bump DOES, as a pure function of the current file contents.
 *
 * This is the layer between the vocabulary (version.mjs: semver, release names,
 * per-file parse/rewrite) and the disk (version-files.mjs). It exists so the
 * release-critical decisions — which number increments, where the suffix comes
 * from, and when to refuse — are unit-testable without touching a filesystem.
 * `bump-version.mjs` is then a genuinely thin wrapper: parse argv, read, plan,
 * write, print.
 *
 * Layering is one-way — version.mjs → version-plan.mjs → version-files.mjs —
 * so nothing here can reach the disk.
 */

import {
  bumpSemver,
  parseAppJson,
  parsePackageVersion,
  parseAppInfo,
  rewriteAppJson,
  rewritePackageVersion,
  rewriteAppInfo,
  assertVersionsConsistent,
} from './version.mjs'

/**
 * @typedef {{ appJson: string, pkg: string, appInfo: string }} VersionTexts
 */

/**
 * Parse in-memory file contents into the shape the gate consumes.
 *
 * @param {VersionTexts} texts
 */
export function parseVersionSources(texts) {
  return {
    appJson: parseAppJson(texts.appJson),
    packageVersion: parsePackageVersion(texts.pkg),
    appInfo: parseAppInfo(texts.appInfo),
  }
}

/**
 * Compute the next version and the rewritten contents of all three files.
 * Throws — writing nothing — if either the current or the resulting state is
 * inconsistent.
 *
 * @param {VersionTexts} texts current file contents
 * @param {'major'|'minor'|'patch'} kind
 * @param {string} [suffix] release qualifier; defaults to the one in use.
 *   Pass `''` explicitly for a plain `v1.0.0`.
 * @returns {{ current: ReturnType<typeof assertVersionsConsistent>,
 *   next: VersionTexts, result: ReturnType<typeof assertVersionsConsistent> }}
 */
export function planBump(texts, kind, suffix) {
  // Refuse to bump from a broken state. Bumping a repo that is ALREADY drifted
  // would rewrite every file to agree and quietly launder the drift away —
  // the one outcome worse than the drift, because it looks like a clean bump.
  const current = assertVersionsConsistent(parseVersionSources(texts))

  const version = bumpSemver(current.version, kind)
  // Owned here, not by EAS `autoIncrement`: EAS writes its bump into app.json
  // on the build machine, which a CI runner discards, so every release would
  // re-bump from the same base. Monotonic because it derives from the committed
  // file rather than from build history.
  const versionCode = current.versionCode + 1
  // `??` not `||` — an explicit empty suffix (the plain v1.0.0 case) must not
  // fall back to the current one.
  const nextSuffix = suffix ?? current.suffix

  const next = {
    appJson: rewriteAppJson(texts.appJson, { version, versionCode }),
    pkg: rewritePackageVersion(texts.pkg, version),
    appInfo: rewriteAppInfo(texts.appInfo, { version, suffix: nextSuffix }),
  }

  // Re-run the gate over what we are ABOUT to write rather than over what we
  // wrote: a rewrite that would land the repo inconsistent fails with nothing
  // on disk.
  return { current, next, result: assertVersionsConsistent(parseVersionSources(next)) }
}
