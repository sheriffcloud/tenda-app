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
 * `run: node scripts/x.mjs ${{ inputs.suffix }}` would sail past a
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
 * Turns a one-off audit into a standing guard. `suffix` is free-form operator
 * input; interpolated into a script body it is a shell-injection vector, which
 * is why every value reaches the shell through `env:` instead.
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

test('the profile the workflow builds is declared in eas.json', () => {
  const profile = yaml.match(/--profile (\S+)/)
  assert.ok(profile, 'expected the build step to name a profile')
  const eas = JSON.parse(readFileSync(resolve(ROOT, 'apps/mobile/eas.json'), 'utf8'))
  assert.ok(
    Object.keys(eas.build ?? {}).includes(profile[1]),
    `workflow builds --profile ${profile[1]}, which eas.json does not declare ` +
      `(declared: ${Object.keys(eas.build ?? {}).join(', ')})`,
  )
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
