/**
 * App-version consistency (pure, unit-testable).
 *
 * The shipped app version lives in three files that must never disagree:
 *   - apps/mobile/app.json          SOURCE OF TRUTH — expo.version, the Android
 *                                   versionCode and the iOS buildNumber
 *   - apps/mobile/package.json      Expo's `exp.version ?? pkg.version` fallback
 *                                   reads this, so a stale value is a silent
 *                                   wrong answer rather than an error
 *   - apps/tendahq/src/content/     the landing page's advertised version AND
 *     app-info.ts                   the APK download URL
 *
 * The APK URL is the sharp edge: GitHub serves a release asset at
 * `<repo>/releases/download/<tag>/<file>`, and our tag and filename use
 * DIFFERENT formats — `v0.4.2-testnet` vs `0.4.2-testnet.apk`. Either one can go
 * stale on its own and produce a 404 that nothing else in the repo notices, so
 * both segments are validated separately against the same version.
 *
 * No release identifier is hardcoded here. The version comes from app.json, the
 * suffix from whatever app-info.ts last recorded, and the repository from the
 * existing URL's own prefix — so cutting a plain `v1.0.0` later needs no edit to
 * this file.
 */

/** Bump kinds accepted by `bumpSemver`, widest first. */
export const BUMP_KINDS = /** @type {const} */ (['major', 'minor', 'patch'])

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/

/**
 * `v<semver>` with an optional `-<suffix>` qualifier (`v0.4.2-testnet`, or a
 * bare `v1.0.0` once the app leaves testnet). The suffix is greedy-free on
 * purpose: `-` is legal inside it, so `v1.0.0-testnet-rc1` keeps its full tail.
 */
const RELEASE_RE = /^v(\d+\.\d+\.\d+)(?:-(.+))?$/

/** `<origin+repo>/releases/download/<tag>/<file>` — the only shape GitHub serves. */
const APK_URL_RE = /^(https?:\/\/[^\s'"]+?)\/releases\/download\/([^/'"]+)\/([^/'"]+)$/

/**
 * @param {string} version
 * @returns {{ major: number, minor: number, patch: number } | null}
 */
export function parseSemver(version) {
  const m = typeof version === 'string' ? version.match(SEMVER_RE) : null
  if (m === null) return null
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) }
}

/**
 * @param {string} version
 * @param {'major'|'minor'|'patch'} kind
 * @returns {string} the next version
 */
export function bumpSemver(version, kind) {
  const parsed = parseSemver(version)
  if (parsed === null) throw new Error(`version: "${version}" is not a valid x.y.z version`)
  if (!BUMP_KINDS.includes(kind)) {
    throw new Error(`version: unknown bump "${kind}" (expected ${BUMP_KINDS.join(' | ')})`)
  }
  const { major, minor, patch } = parsed
  if (kind === 'major') return `${major + 1}.0.0`
  if (kind === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

/**
 * A release suffix ends up in a git tag AND a URL path segment, so it is
 * restricted to what both accept unambiguously: alphanumerics separated by
 * `.`, `_` or `-`, never leading or trailing. Empty is legal — that is the
 * plain `v1.0.0` case.
 */
const SUFFIX_RE = /^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/

/** @param {string} suffix @returns {string} the suffix, unchanged */
export function assertValidSuffix(suffix) {
  if (typeof suffix !== 'string') throw new Error(`version: suffix must be a string`)
  if (suffix !== '' && !SUFFIX_RE.test(suffix)) {
    throw new Error(
      `version: suffix "${suffix}" is not usable in a git tag and a URL ` +
        `(letters, digits, and inner . _ - only)`,
    )
  }
  return suffix
}

/** `0.4.2` + `testnet` → `0.4.2-testnet`; an empty suffix yields `0.4.2`. */
export function releaseName(version, suffix) {
  // The single funnel both the tag and the filename pass through, so validating
  // here covers a suffix arriving from the CLI and one already sitting in
  // app-info.ts — neither can reach a git tag unchecked.
  return assertValidSuffix(suffix) ? `${version}-${suffix}` : version
}

/** The git tag / GitHub release name. */
export function releaseTag(version, suffix) {
  return `v${releaseName(version, suffix)}`
}

/** The uploaded asset's filename — deliberately NOT the tag format. */
export function apkFileName(version, suffix) {
  return `${releaseName(version, suffix)}.apk`
}

/**
 * Swap the tag and filename of an existing release-download URL, keeping its
 * origin and repository. Nothing here knows the repo name.
 *
 * @param {string} url an existing `.../releases/download/<tag>/<file>` URL
 * @returns {string}
 */
export function rewriteApkUrl(url, version, suffix) {
  const m = url.match(APK_URL_RE)
  if (m === null) throw new Error(`version: apkUrl is not a release-download URL: ${url}`)
  return `${m[1]}/releases/download/${releaseTag(version, suffix)}/${apkFileName(version, suffix)}`
}

// --- source parsers -------------------------------------------------------

/**
 * @param {string} text apps/mobile/app.json
 * @returns {{ version: unknown, versionCode: unknown, buildNumber: unknown }}
 *   Values are returned as found — validation is assertVersionsConsistent's
 *   job, so a missing field reaches the caller as a named error rather than a
 *   TypeError thrown from inside a parser.
 */
export function parseAppJson(text) {
  const expo = JSON.parse(text).expo ?? {}
  return {
    version: expo.version,
    versionCode: expo.android?.versionCode,
    buildNumber: expo.ios?.buildNumber,
  }
}

/**
 * @param {string} text apps/mobile/package.json
 * @returns {unknown} the `version` field as found
 */
export function parsePackageVersion(text) {
  return JSON.parse(text).version
}

/**
 * @param {string} text apps/tendahq/src/content/app-info.ts
 * @returns {{ release: string, version: string|null, suffix: string, apkUrl: string,
 *   apkTag: string, apkFile: string }}
 */
export function parseAppInfo(text) {
  const release = matchOnce(text, /version:\s*'([^']*)'/g, 'app-info version')
  const apkUrl = matchOnce(text, /apkUrl:\s*'([^']*)'/g, 'app-info apkUrl')

  const rel = release.match(RELEASE_RE)
  const url = apkUrl.match(APK_URL_RE)
  if (url === null) throw new Error(`version: apkUrl is not a release-download URL: ${apkUrl}`)

  return {
    release,
    version: rel === null ? null : rel[1],
    suffix: rel === null ? '' : (rel[2] ?? ''),
    apkUrl,
    apkTag: url[2],
    apkFile: url[3],
  }
}

/**
 * The single capture of the single match. Requiring EXACTLY one occurrence is
 * what keeps these regexes honest: a renamed field would otherwise parse as
 * "absent" and a duplicated one would silently pick the first.
 *
 * @param {RegExp} re a global regex with one capture group
 */
function matchOnce(text, re, what) {
  const all = [...text.matchAll(re)]
  if (all.length === 0) throw new Error(`version: no ${what} found`)
  if (all.length > 1) throw new Error(`version: ${all.length} ${what} entries found, expected 1`)
  return all[0][1]
}

// --- rewriters ------------------------------------------------------------

/**
 * Rewrites are surgical rather than a JSON/AST round-trip: re-serialising
 * package.json would reformat a file pnpm also writes, and rewriting app-info.ts
 * through anything but its own text would mean parsing TypeScript. Each helper
 * replaces exactly one occurrence and throws otherwise, so a field that moved
 * fails loudly instead of writing a file that no longer carries the version.
 */
function replaceOnce(text, re, replacement, what) {
  const all = [...text.matchAll(re)]
  if (all.length === 0) throw new Error(`version: cannot rewrite ${what} — no match`)
  if (all.length > 1) throw new Error(`version: cannot rewrite ${what} — ${all.length} matches`)
  // Spliced by index rather than `String.replace`, which treats `$&`, `$1` and
  // friends in the REPLACEMENT as substitution patterns. The replacement here
  // is built partly from file content (the apkUrl's own origin), so it is not
  // ours to assume is `$`-free.
  const { index, 0: matched } = all[0]
  return text.slice(0, index) + replacement + text.slice(index + matched.length)
}

/**
 * @param {string} text apps/mobile/app.json
 * @param {{ version: string, versionCode: number }} next
 */
export function rewriteAppJson(text, { version, versionCode }) {
  let out = replaceOnce(text, /"version":\s*"[^"]*"/g, `"version": "${version}"`, 'app.json version')
  out = replaceOnce(
    out,
    /"versionCode":\s*\d+/g,
    `"versionCode": ${versionCode}`,
    'app.json versionCode',
  )
  return replaceOnce(
    out,
    /"buildNumber":\s*"[^"]*"/g,
    `"buildNumber": "${versionCode}"`,
    'app.json buildNumber',
  )
}

/**
 * @param {string} text apps/mobile/package.json
 * @param {string} version
 */
export function rewritePackageVersion(text, version) {
  return replaceOnce(
    text,
    /"version":\s*"[^"]*"/g,
    `"version": "${version}"`,
    'package.json version',
  )
}

/**
 * @param {string} text apps/tendahq/src/content/app-info.ts
 * @param {{ version: string, suffix: string }} next
 */
export function rewriteAppInfo(text, { version, suffix }) {
  const { apkUrl } = parseAppInfo(text)
  const out = replaceOnce(
    text,
    /version:\s*'[^']*'/g,
    `version: '${releaseTag(version, suffix)}'`,
    'app-info version',
  )
  return replaceOnce(
    out,
    /apkUrl:\s*'[^']*'/g,
    `apkUrl: '${rewriteApkUrl(apkUrl, version, suffix)}'`,
    'app-info apkUrl',
  )
}

// --- the gate -------------------------------------------------------------

/**
 * Throw unless every version source agrees.
 *
 * @param {{
 *   appJson: ReturnType<typeof parseAppJson>,
 *   packageVersion: unknown,
 *   appInfo: ReturnType<typeof parseAppInfo>,
 * }} sources
 * @returns {{ version: string, versionCode: number, suffix: string, tag: string, apk: string }}
 */
export function assertVersionsConsistent({ appJson, packageVersion, appInfo }) {
  const { version, versionCode, buildNumber } = appJson

  if (typeof version !== 'string' || parseSemver(version) === null) {
    throw new Error(`app.json: expo.version "${version}" is not a valid x.y.z version`)
  }
  if (!Number.isInteger(versionCode) || versionCode < 1) {
    throw new Error(
      `app.json: expo.android.versionCode must be a positive integer, got ${JSON.stringify(versionCode)}`,
    )
  }
  // Android rejects a repeated versionCode and iOS a repeated buildNumber, so
  // they are one number wearing two types — keeping them equal means a release
  // has ONE build identifier, not a per-platform pair that can slip apart.
  if (buildNumber !== String(versionCode)) {
    throw new Error(
      `app.json: expo.ios.buildNumber ${JSON.stringify(buildNumber)} !== versionCode "${versionCode}"`,
    )
  }
  if (packageVersion !== version) {
    throw new Error(
      `apps/mobile/package.json version ${JSON.stringify(packageVersion)} !== app.json "${version}"`,
    )
  }
  if (appInfo.version === null) {
    throw new Error(`app-info.ts: version '${appInfo.release}' is not v<x.y.z>[-suffix]`)
  }
  if (appInfo.version !== version) {
    throw new Error(`app-info.ts version '${appInfo.release}' !== app.json "${version}"`)
  }

  const { suffix } = appInfo
  const tag = releaseTag(version, suffix)
  const apk = apkFileName(version, suffix)
  if (appInfo.apkTag !== tag) {
    throw new Error(`app-info.ts: apkUrl tag '${appInfo.apkTag}' !== release tag '${tag}'`)
  }
  if (appInfo.apkFile !== apk) {
    throw new Error(`app-info.ts: apkUrl file '${appInfo.apkFile}' !== asset name '${apk}'`)
  }

  return { version, versionCode: Number(versionCode), suffix, tag, apk }
}
