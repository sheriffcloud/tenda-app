/**
 * .c8rc.json's exclusions, checked against the files they exclude.
 *
 * An exclusion is a claim, and coverage cannot verify it — that is the whole
 * point of an exclusion. So the claim gets checked here instead. This is its
 * own file rather than a corner of the suite that happened to add one, because
 * the excluded files belong to three unrelated features and whoever breaks the
 * claim will be editing one of those, not the queue.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripComments } from '../helpers/source-scan'

const SERVER_ROOT = join(__dirname, '..', '..')

/**
 * The `exclude` list out of .c8rc.json, NARROWED rather than asserted.
 *
 * `JSON.parse` returns `any`, and `as { exclude: string[] }` on top of it is a
 * claim the compiler cannot check — the same objection test/helpers/fetch-stub.ts
 * spells out about `as Response`. If the key were ever renamed the assertion
 * would keep compiling and the caller would read `undefined.filter`, failing
 * with a TypeError that names neither the file nor the key. These checks fail
 * with the reason instead.
 */
function c8Exclusions(): string[] {
  const parsed: unknown = JSON.parse(readFileSync(join(SERVER_ROOT, '.c8rc.json'), 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || !('exclude' in parsed)) {
    assert.fail('.c8rc.json has no `exclude` key')
  }
  const { exclude } = parsed
  if (!Array.isArray(exclude)) assert.fail('.c8rc.json `exclude` is not an array')
  return exclude.filter((entry): entry is string => typeof entry === 'string')
}

/**
 * Any export that is NOT `export type` / `export interface` — a whitelist,
 * rather than a list of runtime keywords to hunt for.
 *
 * The keyword list came first and was measured second, and it had four holes:
 * `export async function` (the `async` sits between `export` and `function`),
 * `export * from`, `export { x } from` and `export default expr`. All four emit
 * runtime code; all four sailed past. The re-export forms are the plausible
 * ones, because a file full of types is exactly where someone reaches for a
 * barrel line.
 *
 * Inverting removes the whole class: a new syntax for exporting a value is
 * flagged by default rather than missed until someone thinks to add it. The
 * cost is one known false positive, `export declare const` — ambient, and
 * genuinely erased — and that direction is the safe one, because it fails
 * loudly with a message saying what to do.
 */
const RUNTIME_EXPORT = /^export\b(?!\s+(?:type|interface)\b)/m

test('the type-only rule reads both kinds of export correctly', () => {
  // Pins the RULE, not just its verdict on today's files. All three excluded
  // files pass under the old keyword list too, so a "simplification" back to it
  // would restore the four holes and no other assertion here would notice —
  // the same trap the `new Queue` scan and the BullMQ jobId mirror both fell
  // into earlier in this backlog.
  for (const src of [
    'export const X = 1',
    'export async function f(): Promise<void> {}',
    "export * from './other'",
    "export { helper } from './helper'",
    'export default makeThing()',
    'export enum E { A }',
    'export class C {}',
  ]) {
    assert.ok(RUNTIME_EXPORT.test(src), `should be seen as runtime: ${src}`)
  }

  for (const src of [
    'export type A = string',
    'export interface B { a: string }',
    "export type { C } from './c'",
    "export type {\n  D,\n} from './d'",
  ]) {
    assert.ok(!RUNTIME_EXPORT.test(src), `should be seen as erased: ${src}`)
  }
})

test('every c8-excluded type file is still type-only', () => {
  // The exclusions in .c8rc.json are not all alike. Three of them —
  // features/fiat-rails/types.ts, features/moderation/types.ts and
  // plugins/queue/payloads.ts — are excluded on ONE ground: they declare types
  // and nothing else, so their compiled output is the ~110-byte `use strict` +
  // `__esModule` stub, they are never required at runtime, and `all: true`
  // scores them 0% over every line they have. plugins/queue/payloads.ts alone
  // took the suite total down 0.34 points for 122 lines of interface.
  //
  // The ground can stop holding without anyone noticing, and that is the point
  // of this test. payloads.ts is precisely the file edited when a queue is
  // added; a `const` dropped in beside the interfaces would be real, live,
  // untested code that coverage has been told to ignore. The exclusion would
  // still look correct — the filename still says "payloads".
  //
  // DERIVED from the config, so an exclusion added later is covered without
  // anyone remembering this file. Narrowed on the FILENAME segment, because the
  // remaining entries are excluded on entirely different grounds and this claim
  // is not made about them: src/server.ts is the process entry point, notice.ts
  // is copy, and the globs cover generated migrations and operator scripts.
  // Anchored to a path boundary so a future `prototypes.ts` is not dragged in
  // by the suffix alone.
  const typeFiles = c8Exclusions().filter((p) => /(?:^|\/)(?:types?|payloads)\.ts$/.test(p))
  let checked = 0

  for (const rel of typeFiles) {
    // A vanished file is the NEXT test's finding, and reading it here would
    // bury that under an ENOENT stack. Skipping keeps each failure to its own
    // reason — and the floor below still fires, because a skip does not count.
    if (!existsSync(join(SERVER_ROOT, rel))) continue
    checked++
    assert.ok(
      !RUNTIME_EXPORT.test(stripComments(readFileSync(join(SERVER_ROOT, rel), 'utf8'))),
      `${rel} is excluded from coverage as type-only, but now exports runtime ` +
        `code — that code is live and unmeasured. Move it to a file coverage ` +
        `still sees, or drop the exclusion`,
    )
  }

  // A scan that matches nothing passes, so the floor is what keeps a rename
  // from quietly emptying the list.
  assert.ok(checked >= 3, `expected the three type-only exclusions, matched ${checked}`)
})

test('every c8-excluded path still exists', () => {
  // A stale exclusion is not harmless: it reads as a standing decision that
  // some file does not need covering, and the next person adding a file with
  // that name inherits the exemption without anyone choosing it. Globs are
  // skipped — they are patterns, not paths, and may legitimately match nothing.
  const concrete = c8Exclusions().filter((p) => !p.includes('*'))
  assert.ok(concrete.length >= 4, `expected the concrete exclusions, found ${concrete.length}`)

  for (const rel of concrete) {
    // `existsSync`, not a `doesNotThrow` around a read: doesNotThrow prefixes
    // the reason with "Got unwanted exception", which buries the sentence that
    // says what to do about it.
    assert.ok(
      existsSync(join(SERVER_ROOT, rel)),
      `.c8rc.json excludes ${rel}, which no longer exists — drop the entry`,
    )
  }
})
