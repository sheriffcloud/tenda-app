#!/usr/bin/env node
/**
 * verify-release-url.mjs
 *
 * Asserts the apkUrl already written into the landing page is exactly the URL
 * this release will publish.
 *
 * `bump-version` writes that URL BEFORE the asset exists — it is a promise the
 * release has to keep. check-app-version validates its tag and filename, but it
 * cannot validate the REPOSITORY: it derives that from the URL already in the
 * file, so a stale owner (a fork, a rename) passes every check and then 404s
 * for every visitor. Only the workflow knows the real repository.
 *
 * Run it AFTER the bump and BEFORE the release is published, so a wrong link
 * stops the release instead of shipping.
 *
 * Usage:  node scripts/verify-release-url.mjs <owner/name> <tag> <asset.apk>
 */

import { parseAppInfo } from './lib/version.mjs'
import { assertPredictedUrlMatches } from './lib/release.mjs'
import { readVersionSources } from './lib/version-files.mjs'

const [repo, tag, apk] = process.argv.slice(2)

if (repo === undefined || tag === undefined || apk === undefined) {
  console.error('✗ usage: node scripts/verify-release-url.mjs <owner/name> <tag> <asset.apk>')
  process.exit(1)
}

try {
  const { texts } = readVersionSources()
  const { apkUrl } = parseAppInfo(texts.appInfo)
  const expected = assertPredictedUrlMatches(apkUrl, repo, tag, apk)
  console.log(`✓ the landing page already points at this release`)
  console.log(`  ${expected}`)
} catch (err) {
  console.error(`✗ ${err.message}`)
  process.exit(1)
}
