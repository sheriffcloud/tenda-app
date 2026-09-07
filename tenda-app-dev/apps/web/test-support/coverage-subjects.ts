/**
 * Which modules the unit suite actually exercises.
 *
 * `coverage.include` in vitest.config.ts is an allow-list, so a file outside it
 * contributes nothing to the reported figures even when it has a full suite —
 * "web coverage is 98%" is a statement about the LISTED files, not about web.
 * #58 found that drift on mobile (110 of 191 exercised modules outside the
 * gate); #69 measured it here and found nine, all route pages under app/(app)/,
 * each with real cases whose subject could not move the number.
 *
 * Two signals, in order, and the ORDER is the design:
 *
 *   BY NAME — a suite tests the module of the same name in the directory it
 *   belongs to: `hooks/gig/__tests__/useFoo.test.ts` -> `hooks/gig/useFoo.ts`.
 *   Suffixed splits count too (`useFoo.races.test.ts` -> `useFoo.ts`), because
 *   that is how the big suites here were split.
 *
 *   BY IMPORT — a suite named for a THEME rather than a module
 *   (`app/(app)/settings/__tests__/settings-index.test.tsx`) declares its
 *   subjects by importing them. Only imports landing inside the owning
 *   directory count, at any depth; anything outside it is a collaborator.
 *
 * The by-import signal is the FALLBACK, not an addition. Applied to every suite
 * it re-labels every shared component a sibling's test happens to render.
 *
 * DUPLICATED FROM apps/mobile/test-support/coverage-subjects.ts, deliberately —
 * see test-support/vitest-gate.ts for the reasoning and the follow-up task. The
 * pure path logic is the same; what differs is how each runner is asked what it
 * gates, and that is the half worth getting right per-app.
 *
 * KNOWN LIMIT, stated because a checker that overclaims is worse than none: a
 * theme-named suite whose subject it does not import — through a helper, or a
 * barrel two directories up — resolves to nothing and is reported as
 * unresolved rather than silently counted.
 */
import fs from 'node:fs'
import path from 'node:path'

const SOURCE_EXTENSIONS = ['.ts', '.tsx'] as const
/**
 * Never walked: dependencies, build output, reports, VCS metadata.
 *
 * `e2e/` is deliberately NOT here. It is hand-written source rather than any of
 * those, and skipping it changed no answer (measured): its specs sit at the
 * folder root as `*.spec.ts` with no `__tests__` directory, so the walk already
 * ignores them and nothing under it can resolve as a subject.
 */
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '.next',
  'coverage',
  '.git',
  'test-results',
  'playwright-report',
])
const TESTS_DIRECTORY = '__tests__'
/**
 * Directories that SERVE the suites — shared fixtures and manual mocks, in
 * jest/vitest's conventional names. Neither a subject nor gateable source:
 * instrumenting a fixture measures the harness and inflates the figure
 * (mobile's #65 hit exactly this).
 */
const TEST_SUPPORT_DIRECTORIES = new Set(['__fixtures__', '__mocks__'])
/** Marks a SUITE and strips the suffix off its name. */
const SUITE_SUFFIX = /\.test\.tsx?$/
/** `from '…'`, `require('…')` and `vi.mock('…')` — the ways a suite names a module. */
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\brequire\(\s*|\bvi\.mock\(\s*)['"]([^'"]+)['"]/g
/** tsconfig `paths`: `@/*` -> `./*`, rooted at the app directory. */
const ALIAS_PREFIX = '@/'

export interface TestSubjects {
  /** The suites, root-relative. */
  testFiles: string[]
  /**
   * Every `.ts`/`.tsx` that is NOT a suite — what a coverage pattern can match.
   *
   * Added in #82 for the other half of "the gate cannot see it": a pattern
   * naming a path that no longer exists gates nothing and says nothing, so the
   * code it named drops out of the measurement silently when it moves.
   */
  sourceFiles: string[]
  /** Every module those suites exercise, root-relative, sorted and unique. */
  subjects: string[]
  /** Suites no subject could be resolved for — the known limit above. */
  unresolved: string[]
}

/** Root-relative POSIX path, so the keys match the config's globs. */
function toKey(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join('/')
}

/**
 * Exported through a trailing statement, NOT as `export function`. #77's parity
 * suite compares this function's body against mobile's byte for byte, and the
 * `export ` prefix is part of what it captures — so marking the declaration
 * would fail parity for a difference that is not one. The consumer is
 * `coverage-gate.test.ts`, which asserts no fixture is instrumented (#83) and
 * would otherwise re-encode this exact rule as its third copy.
 */
export { isTestSupport }

function isTestSupport(file: string): boolean {
  return file.split('/').some((segment) => TEST_SUPPORT_DIRECTORIES.has(segment))
}

function inTestsDirectory(file: string): boolean {
  return file.split('/').includes(TESTS_DIRECTORY)
}

function listFiles(root: string): string[] {
  const found: string[] = []
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue
      const child = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(child)
      else found.push(toKey(root, child))
    }
  }
  visit(root)
  return found
}

/**
 * Resolve a specifier the way an import in this app resolves: the exact path,
 * then a `.ts`/`.tsx` extension, then a directory's index barrel.
 */
function resolveModule(files: ReadonlySet<string>, candidate: string): string | null {
  const attempts = [
    candidate,
    ...SOURCE_EXTENSIONS.map((extension) => candidate + extension),
    ...SOURCE_EXTENSIONS.map((extension) => `${candidate}/index${extension}`),
  ]
  return attempts.find((attempt) => files.has(attempt)) ?? null
}

/**
 * The directory a suite belongs to: `hooks/gig/__tests__/useFoo.test.ts` ->
 * `hooks/gig`.
 *
 * The `: directory` arm serves jest's flat layout — a suite written beside its
 * subject — which web's single `__tests__`-rooted pattern never produces. It
 * was long read as unreachable here for that reason, and #84 measured it and
 * found otherwise: a suite nested DEEPER inside `__tests__`
 * (`hooks/__tests__/nested/useFoo.test.ts`) is still matched by that pattern,
 * and its parent is not named `__tests__`, so it takes this arm and the owner
 * becomes the nested directory itself. Two consequences, both pinned in
 * `coverage-subjects.by-import.test.ts`, so the arm is covered without
 * exporting this helper for a test alone:
 *
 *   BY IMPORT it resolves to nothing. Every candidate under that owner is also
 *   under `__tests__`, which `subjectsByImport` refuses, so the suite lands in
 *   `unresolved` — a safe failure, since the gate's partition then forces
 *   someone to classify it.
 *
 *   BY NAME it can resolve, to a sibling module inside `__tests__`.
 *   `subjectByName` applies no such filter, so the subject is a file that
 *   `coverage.exclude` drops and `sourceFiles` never offers — one the gate
 *   cannot instrument. It fails loudly as an unregistered subject rather than
 *   quietly mismeasuring, which is why this is recorded rather than fixed
 *   inside a function #77 holds byte-identical with mobile's.
 */
function ownerOf(testFile: string): string {
  const directory = path.posix.dirname(testFile)
  return path.posix.basename(directory) === TESTS_DIRECTORY
    ? path.posix.dirname(directory)
    : directory
}

function subjectByName(files: ReadonlySet<string>, testFile: string): string | null {
  const owner = ownerOf(testFile)
  let stem = path.posix.basename(testFile).replace(SUITE_SUFFIX, '')
  while (stem) {
    const hit = resolveModule(files, path.posix.join(owner, stem))
    if (hit) return hit
    // `<= 0`, not `< 0`: a name whose only dot is at index 0 strips to an empty
    // stem, which ends the loop at a second `return null` no mutation could
    // tell apart from this one. One exit instead.
    const split = stem.lastIndexOf('.')
    if (split <= 0) break
    stem = stem.slice(0, split)
  }
  return null
}

function subjectsByImport(
  files: ReadonlySet<string>,
  testFile: string,
  source: string,
): string[] {
  const owner = ownerOf(testFile)
  const found = new Set<string>()
  for (const [, specifier] of source.matchAll(IMPORT_SPECIFIER)) {
    const candidate = specifier.startsWith(ALIAS_PREFIX)
      ? specifier.slice(ALIAS_PREFIX.length)
      : specifier.startsWith('.')
        ? path.posix.normalize(path.posix.join(path.posix.dirname(testFile), specifier))
        : null
    if (candidate === null) continue
    const hit = resolveModule(files, candidate)
    // Anywhere UNDER the owning directory, not just directly in it — a route
    // suite reaches its own `page.tsx` and the segments below it.
    if (
      hit !== null &&
      hit.startsWith(`${owner}/`) &&
      !inTestsDirectory(hit) &&
      !isTestSupport(hit)
    ) {
      found.add(hit)
    }
  }
  return [...found]
}

/** Walk `root` and report what its suites exercise. */
export function collectTestSubjects(root: string): TestSubjects {
  const files = listFiles(root)
  const index = new Set(files)
  const testFiles = files.filter((file) => inTestsDirectory(file) && SUITE_SUFFIX.test(file)).sort()
  // Every `.ts`/`.tsx` that is not a suite file.
  //
  // The coverage EXCLUSIONS are deliberately not applied here. `patternMatcher`
  // applies them per pattern instead, so an include entry whose every match is
  // excluded stays VISIBLE in this set and can be judged dead — filter them out
  // here and it would vanish and look alive. `.d.ts` files are in here for
  // exactly that reason, and coverage-gate.test.ts leans on it.
  //
  // The `__tests__` filter is about what this FIELD means, and parity with
  // mobile's twin, rather than about the check: removing it changes no answer,
  // because `'**/__tests__/**'` is in coverage.exclude and patternMatcher
  // rejects those anyway (measured).
  //
  // `__fixtures__`/`__mocks__` are NOT filtered, where mobile's twin filters
  // them — and that stays true even now #83 has added them to coverage.exclude.
  // They belong in the CANDIDATE set precisely so `patternMatcher` can answer
  // for them: an include entry whose only matches are fixtures is now dead, and
  // the inert-pattern check can only say so if the fixtures are still here to be
  // matched. Filtering them out would make that entry invisible and therefore
  // look alive — the false negative this whole set exists to avoid.
  const sourceFiles = files
    .filter(
      (file) =>
        !inTestsDirectory(file) &&
        SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension)),
    )
    .sort()

  const subjects = new Set<string>()
  const unresolved: string[] = []
  for (const testFile of testFiles) {
    const named = subjectByName(index, testFile)
    if (named !== null) {
      subjects.add(named)
      continue
    }
    const imported = subjectsByImport(index, testFile, fs.readFileSync(path.join(root, testFile), 'utf8'))
    if (imported.length === 0) unresolved.push(testFile)
    imported.forEach((subject) => subjects.add(subject))
  }
  return { testFiles, sourceFiles, subjects: [...subjects].sort(), unresolved }
}
