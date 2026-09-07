#!/usr/bin/env node
/**
 * release-outputs.mjs
 *
 * Turns `bump-version --json` output into `key=value` lines for a GitHub
 * Actions step output, validating every field on the way through.
 *
 * A script rather than inline JS in a YAML run-block, for the same reason
 * release-artifact.mjs exists: everything downstream — the tag, the commit
 * message, the uploaded filename, the URL the landing page promised — is
 * derived from these four values, and a shell pipeline that silently yields an
 * empty string would tag `v` and upload `.apk`.
 *
 * Usage:  node scripts/release-outputs.mjs <bump-json-file> >> "$GITHUB_OUTPUT"
 */

import { readFileSync } from 'node:fs'
import { parseBumpResult } from './lib/release.mjs'

const [source] = process.argv.slice(2)

if (source === undefined) {
  console.error('✗ usage: node scripts/release-outputs.mjs <bump-json-file>')
  process.exit(1)
}

try {
  const r = parseBumpResult(readFileSync(source === '-' ? 0 : source, 'utf8'))
  // Progress on stderr; stdout is only the key=value lines the caller appends.
  console.error(`✓ ${r.version} (versionCode ${r.versionCode}) → ${r.tag} / ${r.apk}`)
  console.log(`version=${r.version}`)
  console.log(`versionCode=${r.versionCode}`)
  console.log(`tag=${r.tag}`)
  console.log(`apk=${r.apk}`)
} catch (err) {
  console.error(`✗ ${err.message}`)
  process.exit(1)
}
