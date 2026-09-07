/**
 * Release plumbing (pure, unit-testable): reading the two JSON documents the
 * release workflow passes between steps, and pinning the download URL the
 * landing page has already promised.
 *
 * This exists instead of `jq` in a YAML `run:` block because every failure here
 * is SILENT and user-facing. `jq -r '.[0].artifacts.applicationArchiveUrl'`
 * prints the string "null" when the shape changes, `curl` happily writes a file
 * called null, and `gh release create` cheerfully publishes it. The download
 * link on the site then serves a corrupt APK and nothing anywhere errored.
 *
 * So each field is validated and each failure is named.
 */

/** EAS build statuses this module cares about (BuildStatus in eas-cli). */
const FINISHED = 'FINISHED'

/**
 * Pull the artifact URL out of `eas build --json` output.
 *
 * The status check is the load-bearing one, and it is not redundant with the
 * CLI's exit code: eas-cli's `exitWithNonZeroCodeIfSomeBuildsFailed` only exits
 * non-zero for ERRORED builds, so a CANCELED build exits 0 with no artifact. A
 * workflow trusting the exit code alone would carry on and publish nothing —
 * or, worse, whatever the previous step left on disk.
 *
 * @param {string} jsonText stdout of `eas build --json`
 * @returns {{ id: string, status: string, platform: string, artifactUrl: string }}
 */
export function parseBuildResult(jsonText) {
  let parsed
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('release: `eas build --json` did not produce JSON')
  }

  // `--json` prints an ARRAY of builds, one per platform requested.
  if (!Array.isArray(parsed)) {
    throw new Error(`release: expected an array of builds, got ${typeof parsed}`)
  }
  if (parsed.length === 0) throw new Error('release: `eas build --json` returned no builds')
  if (parsed.length > 1) {
    throw new Error(
      `release: expected exactly one build, got ${parsed.length} — the release ` +
        'workflow builds a single platform and must not guess which to publish',
    )
  }

  const build = parsed[0]
  if (build === null || typeof build !== 'object') {
    throw new Error('release: build entry is not an object')
  }
  if (build.status !== FINISHED) {
    throw new Error(
      `release: build ${build.id ?? '(no id)'} is ${build.status ?? 'of unknown status'}, ` +
        `not ${FINISHED} — eas-cli exits 0 for a CANCELED build, so this is the ` +
        'only thing standing between a cancelled build and a published release',
    )
  }

  const artifactUrl = build.artifacts?.applicationArchiveUrl
  if (typeof artifactUrl !== 'string' || artifactUrl === '') {
    throw new Error(
      `release: build ${build.id ?? '(no id)'} has no artifacts.applicationArchiveUrl`,
    )
  }
  if (!/^https:\/\//.test(artifactUrl)) {
    throw new Error(`release: artifact URL is not https: ${artifactUrl}`)
  }

  return {
    id: typeof build.id === 'string' ? build.id : '',
    status: build.status,
    platform: typeof build.platform === 'string' ? build.platform : '',
    artifactUrl,
  }
}

/**
 * Validate the `bump-version.mjs --json` result the workflow then tags and
 * uploads from. Parsed rather than trusted because every downstream step — the
 * tag, the asset filename, the release title — is derived from it.
 *
 * @param {string} jsonText
 * @returns {{ version: string, versionCode: number, suffix: string, tag: string, apk: string }}
 */
export function parseBumpResult(jsonText) {
  let parsed
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('release: `bump-version --json` did not produce JSON')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('release: bump result is not an object')
  }

  for (const field of ['version', 'suffix', 'tag', 'apk']) {
    if (typeof parsed[field] !== 'string') {
      throw new Error(`release: bump result field \`${field}\` is not a string`)
    }
  }
  if (!Number.isInteger(parsed.versionCode) || parsed.versionCode < 1) {
    throw new Error(
      `release: bump result versionCode must be a positive integer, got ${JSON.stringify(parsed.versionCode)}`,
    )
  }
  if (parsed.tag === '' || parsed.apk === '') {
    throw new Error('release: bump result has an empty tag or asset name')
  }
  // The two formats differ on purpose (`v0.4.2-testnet` vs `0.4.2-testnet.apk`),
  // and both are used to build the URL the site already advertises.
  if (!parsed.apk.endsWith('.apk')) {
    throw new Error(`release: asset name ${parsed.apk} is not an .apk`)
  }
  if (!parsed.tag.startsWith('v')) {
    throw new Error(`release: tag ${parsed.tag} does not start with v`)
  }

  return {
    version: parsed.version,
    versionCode: parsed.versionCode,
    suffix: parsed.suffix,
    tag: parsed.tag,
    apk: parsed.apk,
  }
}

/**
 * Where GitHub will serve a release asset. The one and only shape.
 *
 * @param {string} repo `owner/name`, as GITHUB_REPOSITORY provides it
 */
export function releaseAssetUrl(repo, tag, apk) {
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    throw new Error(`release: expected repo as "owner/name", got ${JSON.stringify(repo)}`)
  }
  return `https://github.com/${repo}/releases/download/${tag}/${apk}`
}

/**
 * Close the loop on the prediction.
 *
 * `bump-version` writes an apkUrl into the landing page BEFORE the asset
 * exists — it names the file the release must then publish. The version gate
 * checks that URL's tag and filename against app.json, but it cannot check the
 * REPOSITORY: it derives that from the URL already in the file, so a stale
 * owner (a fork, a rename) survives every check and simply 404s.
 *
 * The workflow knows the real repository, so this is the one place that can
 * tell.
 *
 * @param {string} appInfoApkUrl the URL currently written in app-info.ts
 */
export function assertPredictedUrlMatches(appInfoApkUrl, repo, tag, apk) {
  const expected = releaseAssetUrl(repo, tag, apk)
  if (appInfoApkUrl !== expected) {
    throw new Error(
      'release: the landing page points somewhere this release will not publish\n' +
        `  app-info.ts: ${appInfoApkUrl}\n` +
        `  this release: ${expected}`,
    )
  }
  return expected
}
