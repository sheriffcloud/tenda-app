/**
 * Contract tests for the pinned Solana CLI version.
 *
 * The version now appears in two places — `SOLANA_PIN` in
 * .github/workflows/contracts.yml and the install command in
 * contracts/solana/README.md — because CI and a developer's machine have to
 * build the program with the same `cargo-build-sbf`. Two copies drift, and the
 * drift is invisible: the README would quietly send new contributors to a
 * toolchain CI rejects, or worse, one CI does not test.
 *
 * These tests are the same shape as the app-version gate in
 * check-app-version.mjs — one source of truth, machine-checked against every
 * copy — and they run in ci.yml's `scripts` job, which is unfiltered and so
 * sees every PR rather than only contract-touching ones.
 *
 * Parsed with regexes rather than a parser, matching release-workflow.test.mjs,
 * to avoid adding a YAML dependency to a repo that has none — over the file
 * with comment lines stripped, for the reason given at `workflow` below. Each
 * pattern is anchored tightly enough that a restructure fails loudly instead of
 * silently matching nothing.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOW = resolve(ROOT, '.github/workflows/contracts.yml')
const README = resolve(ROOT, 'contracts/solana/README.md')

const readme = readFileSync(README, 'utf8')

/**
 * The workflow with comment lines removed, which is what every assertion below
 * scans.
 *
 * contracts.yml carries a long comment block explaining these exact URLs and
 * env names, so matching the raw file means prose competes with configuration:
 * documenting `release.anza.xyz/v3.0.14/install` as an example would fail the
 * "URL must interpolate SOLANA_PIN" check, and a commented-out `SOLANA_PIN:`
 * could be read as the real pin. Both YAML comments and shell comments inside
 * a `run:` block are `#` at the start of a line, so one rule covers both.
 */
const workflow = readFileSync(WORKFLOW, 'utf8')
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n')

/** The single source of truth: the `env:` the install step pins itself with. */
function workflowPin() {
  const m = workflow.match(/SOLANA_PIN:\s*(v[\d.]+)/)
  assert.ok(m, 'no `SOLANA_PIN: vX.Y.Z` in contracts.yml — did the install step change shape?')
  return m[1]
}

test('the workflow pins an explicit Solana version', () => {
  assert.match(workflowPin(), /^v\d+\.\d+\.\d+$/)
})

test('the installer URL is versioned, since only the URL actually pins', () => {
  // release.anza.xyz bakes the version into the script it serves, as literal
  // `SOLANA_RELEASE=` / `SOLANA_INSTALL_INIT_ARGS=` assignments on lines 1-2.
  // Those CLOBBER the environment, so fetching /stable/install and hoping an
  // `env:` steers it installs whatever stable is — which is how this broke.
  const urls = [...workflow.matchAll(/release\.anza\.xyz\/([^/]+)\/install/g)].map((m) => m[1])
  assert.ok(urls.length > 0, 'expected the workflow to fetch an anza installer')
  for (const seg of urls) {
    assert.notEqual(seg, 'stable', 'contracts.yml fetches /stable/install — that ignores the pin')
    assert.notEqual(seg, 'edge', 'contracts.yml fetches /edge/install — that ignores the pin')
    assert.equal(seg, '${SOLANA_PIN}', `installer URL must interpolate SOLANA_PIN, got /${seg}/`)
  }
})

test('the workflow verifies the version it installed, so the pin cannot go inert', () => {
  // The failure this guards is not "wrong version installed" but "pin silently
  // stopped applying". Only an assertion on the INSTALLED version catches that.
  assert.match(
    workflow,
    /installed="\$\(solana --version\)"/,
    'the install step no longer captures `solana --version` to assert against',
  )
  assert.match(
    workflow,
    /::error::Solana CLI pin did not take/,
    'the install step no longer fails when the installed version disagrees with the pin',
  )
})

test('a failed installer download fails the step instead of being swallowed', () => {
  // `sh -c "$(curl ...)"` reports the shell's status, not curl's, so a 404 on
  // an unpublished pin slips past `set -e` and surfaces later as
  // `solana: command not found`. The fetch must be checked separately.
  assert.match(
    workflow,
    /if ! installer="\$\(curl [^"]*"https:\/\/release\.anza\.xyz/,
    'the installer is no longer fetched into a checked variable before being run',
  )
})

test('the solana README documents the same version the workflow pins', () => {
  assert.ok(existsSync(README), `missing ${README}`)
  const pin = workflowPin()
  const urls = [...readme.matchAll(/release\.anza\.xyz\/(v[\d.]+)\/install/g)].map((m) => m[1])
  assert.ok(
    urls.length > 0,
    'the README no longer shows a versioned install command — contributors will reach for /stable/install',
  )
  for (const documented of urls) {
    assert.equal(
      documented,
      pin,
      `README installs Solana ${documented} but contracts.yml pins ${pin} — ` +
        'a contributor following the README would build the program with a different cargo-build-sbf than CI',
    )
  }
})

test('the README does not also advertise an open-ended floor', () => {
  // The regression this replaced: "Solana CLI >= 2.x / Agave", which resolves
  // to today's stable (v4.x) and is exactly what the pin exists to exclude.
  assert.doesNotMatch(
    readme,
    /Solana CLI\s*(>=|≥)/,
    'the README lists a minimum Solana version again; this is a pin, not a floor',
  )
})
