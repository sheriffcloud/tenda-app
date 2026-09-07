#!/usr/bin/env node
/**
 * release-artifact.mjs
 *
 * Reads `eas build --json` output and prints the APK's download URL, or exits
 * non-zero with a named reason. The release workflow pipes that URL into curl.
 *
 * Deliberately not `jq` in a YAML run-block: a shape change makes jq print the
 * string "null", curl writes a file called null, and the release publishes a
 * corrupt asset with nothing having errored. This also catches a CANCELED
 * build, which eas-cli itself exits 0 for.
 *
 * Usage:  node scripts/release-artifact.mjs <eas-build-json-file>
 *         node scripts/release-artifact.mjs -        # read stdin
 */

import { readFileSync } from 'node:fs'
import { parseBuildResult } from './lib/release.mjs'

const [source] = process.argv.slice(2)

if (source === undefined) {
  console.error('✗ usage: node scripts/release-artifact.mjs <eas-build-json-file>|-')
  process.exit(1)
}

try {
  const text = readFileSync(source === '-' ? 0 : source, 'utf8')
  const { id, platform, artifactUrl } = parseBuildResult(text)
  // Progress goes to stderr so stdout stays a bare URL the caller can capture.
  console.error(`✓ build ${id} (${platform}) finished`)
  console.log(artifactUrl)
} catch (err) {
  console.error(`✗ ${err.message}`)
  process.exit(1)
}
