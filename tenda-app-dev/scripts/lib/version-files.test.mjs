/**
 * Binds the pure version logic to the REAL repo. version.test.mjs proves the
 * parsers and the gate against fixtures; this proves the three paths in
 * VERSION_FILES still exist, still parse, and still agree — which is the half a
 * fixture can never tell you. Moving or renaming app-info.ts fails here.
 *
 * No fs mocking: mocking readFileSync would only test the mock, and the thing
 * worth asserting is the actual file layout.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import {
  assertVersionsConsistent,
  rewriteAppJson,
  rewritePackageVersion,
  rewriteAppInfo,
} from './version.mjs'
import { parseVersionSources } from './version-plan.mjs'
import {
  assertConfigDelegatesVersion,
  assertEasDefersVersioning,
} from './version-delegation.mjs'
import {
  ROOT,
  VERSION_FILES,
  APP_CONFIG_FILE,
  EAS_JSON_FILE,
  readVersionSources,
  readAppConfig,
  readEasJson,
  writeVersionSources,
} from './version-files.mjs'

test('ROOT resolves to the monorepo root', () => {
  assert.ok(existsSync(resolve(ROOT, 'pnpm-workspace.yaml')), `not a workspace root: ${ROOT}`)
})

test('every declared version file exists', () => {
  const declared = Object.values(VERSION_FILES)
  // Guard the guard: an emptied VERSION_FILES would make the loop assert nothing.
  assert.ok(declared.length >= 3, `expected the three version files, got ${declared.length}`)
  for (const rel of declared) {
    assert.ok(existsSync(resolve(ROOT, rel)), `missing version file: ${rel}`)
  }
})

test('the real repo parses and is internally consistent', () => {
  const { version, versionCode, tag, apk } = assertVersionsConsistent(readVersionSources().sources)
  assert.match(version, /^\d+\.\d+\.\d+$/)
  assert.ok(versionCode >= 1)
  // The two halves of the download URL, which use different formats.
  assert.ok(tag.startsWith(`v${version}`), `${tag} does not carry ${version}`)
  assert.ok(apk.startsWith(version) && apk.endsWith('.apk'), `${apk} is not the asset name`)
})

test('parseVersionSources reads the same shape the gate consumes', () => {
  const { texts, sources } = readVersionSources()
  assert.deepEqual(parseVersionSources(texts), sources)
})

test('the real app.config.ts exists and still delegates the version to app.json', () => {
  // The fixtures in version.test.mjs prove the checker; this proves the file it
  // is aimed at. Without it, app.config.ts could be renamed or moved and only
  // the subprocess CLI tests — which build their own scratch copy — would care.
  assert.ok(existsSync(resolve(ROOT, APP_CONFIG_FILE)), `missing ${APP_CONFIG_FILE}`)
  assert.equal(assertConfigDelegatesVersion(readAppConfig()), true)
})

test('the real eas.json exists and still leaves versioning to this repo', () => {
  assert.ok(existsSync(resolve(ROOT, EAS_JSON_FILE)), `missing ${EAS_JSON_FILE}`)
  assert.equal(assertEasDefersVersioning(readEasJson()), true)
})

/**
 * The read → rewrite → write cycle `bump-version` performs, on disk, against a
 * scratch root. Copies the working tree's real files in, so the fixture cannot
 * drift from the format the actual files use.
 *
 * This is the only test in the repo that calls a filesystem WRITER in-process,
 * and its default root is the working tree. That combination bites: if root
 * handling ever breaks — a bug, or a mutant during mutation testing — the write
 * escapes into the real repo, and the assertion that catches it fires only
 * AFTER the damage. So the three real files are snapshotted up front and put
 * back on the way out, making an escape self-healing rather than something the
 * next `git diff` has to discover.
 *
 * The restore is conditional: rewriting identical bytes on every run would
 * churn the mtime of three tracked files and invalidate build caches for a test
 * that is supposed to be read-only outside its scratch directory.
 */
test('the full bump cycle round-trips on disk', (t) => {
  const scratch = mkdtempSync(resolve(tmpdir(), 'tenda-version-'))
  const seed = readVersionSources().texts
  t.after(() => {
    rmSync(scratch, { recursive: true, force: true })
    const now = readVersionSources().texts
    for (const [key, rel] of Object.entries(VERSION_FILES)) {
      if (now[key] !== seed[key]) writeFileSync(resolve(ROOT, rel), seed[key])
    }
  })

  for (const [key, rel] of Object.entries(VERSION_FILES)) {
    mkdirSync(dirname(resolve(scratch, rel)), { recursive: true })
    writeFileSync(resolve(scratch, rel), seed[key])
  }

  const before = assertVersionsConsistent(readVersionSources(scratch).sources)
  const next = { version: '9.9.9', suffix: 'scratch' }

  writeVersionSources(
    {
      appJson: rewriteAppJson(seed.appJson, {
        version: next.version,
        versionCode: before.versionCode + 1,
      }),
      pkg: rewritePackageVersion(seed.pkg, next.version),
      appInfo: rewriteAppInfo(seed.appInfo, next),
    },
    scratch,
  )

  assert.deepEqual(assertVersionsConsistent(readVersionSources(scratch).sources), {
    version: '9.9.9',
    versionCode: before.versionCode + 1,
    suffix: 'scratch',
    tag: 'v9.9.9-scratch',
    apk: '9.9.9-scratch.apk',
  })

  // The working tree is untouched — writeVersionSources honoured the root.
  assert.equal(assertVersionsConsistent(readVersionSources().sources).version, before.version)
})
