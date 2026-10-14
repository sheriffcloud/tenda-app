/**
 * Contract tests between .github/workflows/release.yml and the scripts it calls.
 *
 * The scripts are unit-tested and the workflow is actionlint-clean, but nothing
 * connected the two: rename an output key in release-outputs.mjs, or a script
 * file, and the workflow keeps "working" — GitHub resolves an unknown
 * `steps.bump.outputs.*` to the EMPTY STRING rather than failing, so the run
 * would `git tag -a ""` and upload a file called `.apk`. actionlint cannot see
 * that either, because it does not know what the scripts emit.
 *
 * Parsed with regexes over the raw YAML rather than a parser, to avoid adding a
 * YAML dependency to a repo that has none. The patterns are anchored to the
 * exact syntax used, and the "every script exists" case would fail loudly if
 * the file were restructured beyond what these can read.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

import { resolveEasProfile } from './resolve-eas-profile.mjs'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(SCRIPTS, '..')
const WORKFLOW = resolve(ROOT, '.github/workflows/release.yml')
const yaml = readFileSync(WORKFLOW, 'utf8')

const unique = (xs) => [...new Set(xs)]
const matchAll = (re) => unique([...yaml.matchAll(re)].map((m) => m[1]))

test('the release workflow exists where the docs say it does', () => {
  assert.ok(existsSync(WORKFLOW), `missing ${WORKFLOW}`)
})

test('every script the workflow invokes exists', () => {
  const referenced = matchAll(/node (scripts\/[\w.-]+\.mjs)/g)
  assert.ok(referenced.length >= 4, `expected several script calls, found ${referenced.length}`)
  for (const rel of referenced) {
    assert.ok(existsSync(resolve(ROOT, rel)), `workflow calls missing script: ${rel}`)
  }
})

/**
 * The key contract. GitHub resolves an unknown step output to "" instead of
 * failing, so a renamed key is invisible until a release ships a tag called `v`.
 */
test('every steps.bump.outputs.* the workflow reads is one release-outputs emits', (t) => {
  const referenced = matchAll(/steps\.bump\.outputs\.(\w+)/g)
  assert.ok(referenced.length > 0, 'expected the workflow to read bump outputs')

  const dir = mkdtempSync(resolve(tmpdir(), 'tenda-wf-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const bump = resolve(dir, 'bump.json')
  writeFileSync(
    bump,
    JSON.stringify({
      version: '0.4.2',
      versionCode: 2,
      suffix: 'testnet',
      tag: 'v0.4.2-testnet',
      apk: '0.4.2-testnet.apk',
    }),
  )

  const r = spawnSync(process.execPath, [resolve(SCRIPTS, 'release-outputs.mjs'), bump], {
    encoding: 'utf8',
  })
  assert.equal(r.status, 0, r.stderr)
  const emitted = r.stdout
    .trimEnd()
    .split('\n')
    .map((line) => line.split('=')[0])

  for (const key of referenced) {
    assert.ok(
      emitted.includes(key),
      `workflow reads steps.bump.outputs.${key}, which release-outputs.mjs never emits ` +
        `(it emits: ${emitted.join(', ')}) — GitHub would resolve it to an empty string`,
    )
  }
})

test('every inputs.* the workflow reads is a declared workflow_dispatch input', () => {
  const referenced = matchAll(/inputs\.(\w+)/g)
  assert.ok(referenced.length > 0, 'expected the workflow to read its inputs')
  // The declaration block: two-space-indented keys under `inputs:`.
  const declared = matchAll(/^ {6}(\w+):$/gm)
  for (const name of referenced) {
    assert.ok(
      declared.includes(name),
      `workflow reads inputs.${name}, which is not declared (declared: ${declared.join(', ')})`,
    )
  }
})

/**
 * Every `run:` value, in BOTH spellings: the `run: |` block form and the
 * single-line `run: node scripts/x.mjs` form.
 *
 * Covering only the block form is a blind spot rather than a simplification —
 * this workflow has 14 `run:` keys and only 9 are blocks, so a one-line
 * `run: node scripts/x.mjs ${{ inputs.target }}` would sail past a
 * block-only check. Line-walked rather than regexed as a whole so the count is
 * verifiable against the file.
 */
function runBodies(text) {
  const lines = text.split('\n')
  const bodies = []
  for (let i = 0; i < lines.length; i++) {
    const block = lines[i].match(/^(\s*)run: \|-?\s*$/)
    if (block) {
      const indent = block[1].length
      const body = []
      for (let j = i + 1; j < lines.length; j++) {
        // Blank lines belong to the block; anything indented past the key does too.
        if (lines[j].trim() === '') {
          body.push(lines[j])
          continue
        }
        if (lines[j].search(/\S/) <= indent) break
        body.push(lines[j])
      }
      bodies.push(body.join('\n'))
      continue
    }
    const inline = lines[i].match(/^\s*run: (.+)$/)
    if (inline) bodies.push(inline[1])
  }
  return bodies
}

/**
 * Turns a one-off audit into a standing guard. `target` is operator input (a
 * dropdown today, but untrusted on principle); interpolated into a script body
 * it is a shell-injection vector, which is why every value reaches the shell
 * through `env:` instead.
 */
test('no ${{ }} interpolation appears inside any run: body, block or single-line', () => {
  const bodies = runBodies(yaml)
  // Guard the guard: the assertion below is worthless if the extractor silently
  // stopped finding bodies, and it must see EVERY `run:` key, not just blocks.
  const runKeys = (yaml.match(/^\s*run:/gm) ?? []).length
  assert.equal(bodies.length, runKeys, `extracted ${bodies.length} run bodies, file has ${runKeys}`)
  assert.ok(runKeys >= 10, `expected the workflow to have many run steps, found ${runKeys}`)

  for (const body of bodies) {
    const found = body.match(/\$\{\{[^}]*\}\}/)
    assert.equal(
      found,
      null,
      `run: body interpolates ${found?.[0]} — pass it through env: instead ` +
        '(operator input reaching a shell verbatim is an injection vector)',
    )
  }
})

/**
 * eas-cli resolves the project from its CWD. Run at the repo root it finds no
 * eas.json, GENERATES a default one, and then fails with
 * `Missing build profile: "testnet"` — an error that points at eas.json when
 * the fault is the directory. It cost a real release run to learn that, so the
 * directory is asserted rather than remembered.
 */
test('every eas-cli step runs in the directory that owns eas.json', () => {
  const easSteps = [...yaml.matchAll(/^ {6}- name: ([^\n]+)\n((?: {8}[^\n]*\n|\n)*)/gm)].filter(
    ([, , body]) => body.includes('eas-cli'),
  )
  assert.ok(easSteps.length > 0, 'expected at least one eas-cli step')

  for (const [, name, body] of easSteps) {
    const wd = body.match(/^ {8}working-directory: (\S+)$/m)
    assert.ok(wd, `step "${name.trim()}" runs eas-cli without a working-directory`)
    assert.ok(
      existsSync(resolve(ROOT, wd[1], 'eas.json')),
      `step "${name.trim()}" runs eas-cli in ${wd[1]}, which has no eas.json`,
    )
  }
})

/**
 * The profile is no longer a literal: it is RESOLVED from the release suffix,
 * because a hardcoded `--profile testnet` meant a `--suffix ''` mainnet release
 * would tag v1.0.0 while building the staging-configured testnet app. So the
 * contract to guard changed shape — assert the wiring, not a spelling.
 */
test('the workflow builds a resolved profile, never a hardcoded one', () => {
  const profile = yaml.match(/--profile (\S+)/)
  assert.ok(profile, 'expected the build step to name a profile')
  assert.match(
    profile[1],
    /^"\$[A-Z_]+"$/,
    `workflow builds --profile ${profile[1]} as a literal; it must come from ` +
      `resolve-eas-profile.mjs via env so the profile follows the release suffix`,
  )
  // The env key it reads must actually be fed by the resolver step's output.
  const key = profile[1].replace(/["$]/g, '')
  assert.ok(
    yaml.includes(`${key}: \${{ steps.eas.outputs.profile }}`),
    `${key} is used by --profile but is not wired to steps.eas.outputs.profile`,
  )
})

/**
 * ONE SUFFIX, TWO READERS. `bump-version.mjs` decides the tag and asset name
 * from the suffix; `resolve-eas-profile.mjs` decides which app gets built from
 * it. They must be handed the same value or the release ships an app that does
 * not match its own tag — the exact failure the hardcoded `--profile testnet`
 * used to guarantee.
 *
 * Today they agree because the workflow feeds both from the derive step's
 * `steps.suffix.outputs.suffix`, and bump-version's `suffix ?? current.suffix`
 * fallback is therefore never taken.
 * That is a property of how the workflow is written, not of either script, so
 * it is asserted here rather than assumed: dropping `--suffix` from the bump
 * step would silently reintroduce two sources for one fact.
 */
test('bump-version and the profile resolver read the same suffix', () => {
  const bumpCall = yaml.match(/bump-version\.mjs[^\n]*--suffix "\$(\w+)"/)
  assert.ok(bumpCall, 'expected the bump step to pass --suffix from an env var')
  const resolveCall = yaml.match(/resolve-eas-profile\.mjs "\$(\w+)"/)
  assert.ok(resolveCall, 'expected the resolve step to pass the suffix from an env var')

  // Both env vars must be fed from the same workflow expression.
  const sourceOf = (name) => {
    const m = yaml.match(new RegExp(`^\\s*${name}: (\\$\\{\\{[^}]+\\}\\})`, 'm'))
    assert.ok(m, `${name} is used in a run body but never set in an env: block`)
    return m[1].replace(/\s+/g, '')
  }
  assert.equal(
    sourceOf(bumpCall[1]),
    sourceOf(resolveCall[1]),
    'the bump step and the profile resolver are reading DIFFERENT suffix sources; ' +
      'the built app could then not match the tag it is published under',
  )
})

/**
 * And the resolver must agree with eas.json for every target the dropdown
 * offers, mapped through the same derivation the workflow's suffix step does
 * (`mainnet` → empty suffix, anything else → itself). That agreement is what
 * the old literal-spelling check was really protecting; resolveEasProfile also
 * throws here if any option's profile does not build an apk.
 */
test('every target the workflow can dispatch resolves to a declared apk profile', () => {
  const eas = JSON.parse(readFileSync(resolve(ROOT, 'apps/mobile/eas.json'), 'utf8'))
  const input = yaml.match(
    /^ {6}target:\n(?: {8}.*\n)*? {8}default: (\S+)\n(?: {8}.*\n)*? {8}options: \[([^\]]+)\]$/m,
  )
  assert.ok(input, 'expected the target input to declare a default and an options list')
  const [, declaredDefault, optionsList] = input
  const options = optionsList.split(',').map((o) => o.trim())
  assert.ok(
    options.includes(declaredDefault),
    `target default "${declaredDefault}" is not one of its options (${options.join(', ')})`,
  )

  for (const target of options) {
    const suffix = target === 'mainnet' ? '' : target
    const profile = resolveEasProfile(suffix, eas)
    assert.ok(
      Object.keys(eas.build ?? {}).includes(profile),
      `target "${target}" resolves to profile "${profile}", which eas.json does not declare ` +
        `(declared: ${Object.keys(eas.build ?? {}).join(', ')})`,
    )
  }
})

test('the workflow is dispatch-only — releases are never triggered by a push', () => {
  // A `push:` or `release:` trigger here would spend an EAS build and mutate the
  // tag list on every merge.
  const triggers = yaml.slice(yaml.indexOf('\non:'), yaml.indexOf('\nconcurrency:'))
  assert.match(triggers, /workflow_dispatch:/)
  assert.doesNotMatch(triggers, /^ {2}push:/m)
  assert.doesNotMatch(triggers, /^ {2}(pull_request|release|schedule):/m)
})

test('publishing steps are gated so a dry run cannot push, tag or publish', () => {
  // Every step that mutates the remote must carry the dry-run guard.
  const mutating = ['git push origin', 'gh release create']
  for (const needle of mutating) {
    const idx = yaml.indexOf(needle)
    assert.notEqual(idx, -1, `expected the workflow to contain: ${needle}`)
    // Look back to the start of that step for its `if:`.
    const stepStart = yaml.lastIndexOf('\n      - name:', idx)
    const step = yaml.slice(stepStart, idx)
    assert.match(
      step,
      /if: \$\{\{ !inputs\.dry_run \}\}/,
      `the step running \`${needle}\` is not gated on !inputs.dry_run`,
    )
  }
})
