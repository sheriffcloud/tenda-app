#!/usr/bin/env node
/**
 * bump-version.mjs
 *
 * The ONLY supported way to change the app version. Bumps the semver in
 * app.json, increments the Android versionCode / iOS buildNumber alongside it,
 * and propagates both to apps/mobile/package.json and the landing page's
 * app-info.ts (release string + APK download URL).
 *
 * The versionCode is owned here rather than by EAS `autoIncrement`, which
 * writes its bump into app.json on the BUILD MACHINE — a CI runner throws that
 * away, so every release would re-bump from the same base. One script, one
 * commit, one monotonic number.
 *
 * The apkUrl this writes is a PREDICTION: it points at an asset the release
 * step has not uploaded yet. That is deliberate — the gate then holds the
 * release workflow to publishing exactly that tag and filename.
 *
 * Usage:
 *   node scripts/bump-version.mjs <major|minor|patch> [--suffix <s>] [--dry-run] [--json]
 *
 *   --suffix   release qualifier (`testnet` → tag v0.4.2-testnet). Defaults to
 *              whatever the last release used; pass `--suffix ''` for a plain
 *              v1.0.0.
 *   --dry-run  print the result without writing.
 *   --json     print only the machine-readable result (for CI).
 */

import { parseArgs } from 'node:util'
import { planBump } from './lib/version-plan.mjs'
import { readVersionSources, writeVersionSources, VERSION_FILES } from './lib/version-files.mjs'

const USAGE =
  'usage: node scripts/bump-version.mjs <major|minor|patch> [--suffix <s>] [--dry-run] [--json]'

const fail = (msg) => {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

// parseArgs throws on an unknown or value-less flag. Caught here so a typo'd
// `--sufix` reports like every other failure instead of a raw stack trace —
// this output is what a failed release workflow shows the operator.
let values, positionals
try {
  ;({ values, positionals } = parseArgs({
    options: {
      suffix: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  }))
} catch (err) {
  fail(`${err.message}\n  ${USAGE}`)
}

if (positionals.length !== 1) fail(USAGE)

try {
  const { texts } = readVersionSources()
  const { current, next, result } = planBump(texts, positionals[0], values.suffix)

  if (!values['dry-run']) writeVersionSources(next)

  if (values.json) {
    console.log(JSON.stringify(result))
  } else {
    const what = values['dry-run'] ? 'would bump' : 'bumped'
    console.log(`✓ ${what} ${current.version} → ${result.version} (versionCode ${result.versionCode})`)
    console.log(`  tag   ${result.tag}`)
    console.log(`  asset ${result.apk}`)
    for (const rel of Object.values(VERSION_FILES)) console.log(`  ${rel}`)
  }
} catch (err) {
  fail(err.message)
}
