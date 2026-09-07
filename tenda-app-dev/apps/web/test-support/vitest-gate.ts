/**
 * What vitest's coverage gate actually instruments, answered by vitest's own
 * matcher rather than a lookalike.
 *
 * THE MATCHER IS THE PART WORTH GETTING RIGHT. A checker that disagrees with
 * the real gate is worse than no checker: it reports files as covered that are
 * not, or fails on files that are. So this asks `test-exclude` — which is what
 * `@vitest/coverage-v8` itself imports (its dist/provider.js does
 * `import TestExclude from 'test-exclude'`) — rather than re-deriving the glob
 * semantics. Two properties were verified against it directly, not assumed:
 *
 *   - it needs ABSOLUTE paths; a root-relative one answers false for
 *     everything, which would have made this whole check pass vacuously;
 *   - `app/(app)/profile/\[id\]/page.tsx` is GATED and the unescaped
 *     `app/(app)/profile/[id]/page.tsx` is NOT, reproducing the trap
 *     vitest.config.ts records — a Next dynamic segment is a glob character
 *     class, so an unescaped entry silently matches nothing while looking
 *     listed.
 *
 * PINNED TO THE PROVIDER'S VERSION, not the newest. web's package.json asks
 * for `test-exclude@^7.0.2` because that is what `@vitest/coverage-v8` resolves;
 * 8.0.0 exists upstream. Taking the newer one would quietly give this file a
 * different matcher from the gate it is checking, which is the single failure
 * mode that makes a checker worse than none. Bump it when the provider does.
 *
 * WHY NOT SHARED WITH MOBILE'S EQUIVALENT, which #69 asked to be decided rather
 * than assumed. The pure resolver next door IS duplicated from mobile's, and
 * that cost is real. It is not moved to @tenda/shared because shared is domain
 * logic with a zero-runtime-dependency charter and the SERVER consumes it — a
 * node:fs-touching build-tooling module there changes what shared is. And the
 * half that actually decides the answer is runner-specific on both sides
 * (jest-util's `globsToMatcher` over `collectCoverageFrom` there, `test-exclude`
 * over `coverage.include` here), so "sharing" would mean parameterising over
 * precisely the difference the checker exists to get right.
 *
 * #77 RE-EXAMINED THAT AND KEPT IT, against its own two triggers rather than by
 * taste. No third consumer: server, admin and tendahq have no coverage gate and
 * no test-support/ at all. And the pure half had not drifted — comparing the two
 * files function by function, with comments stripped and whitespace collapsed,
 * `toKey`, `isTestSupport`, `listFiles`, `resolveModule`, `ownerOf` and
 * `subjectByName` are byte-identical, including the `<= 0` fix in the last one.
 * Only `collectTestSubjects` and `subjectsByImport` differ, plus web's
 * `inTestsDirectory`, which mobile has no counterpart to because it takes the
 * matcher in — and all of that is the runner seam this note describes.
 *
 * What #77 added is the thing that makes "revisit on drift" keepable:
 * `__tests__/coverage-resolver-parity.test.ts` fails when a must-match function
 * stops matching, when either copy grows a function neither list classifies, or
 * when an allowance rots — its function having stopped differing, or having been
 * deleted from both copies. Before it, the copies could diverge and the only way
 * to find out was to read both files.
 */
import path from 'node:path'
import TestExclude from 'test-exclude'
import config from '../vitest.config'

/**
 * The suite pattern this app's resolver assumes — declared here and ASSERTED
 * against the config, not read from it.
 *
 * The distinction matters. vitest resolves `test.include` with tinyglobby,
 * which is not cheaply importable, so the resolver walks the pattern
 * structurally instead. That is an assumption, and an unchecked assumption
 * would let the config change while the resolver quietly kept reading the wrong
 * set of files. `coverage-gate.test.ts` asserts the config still says exactly
 * this string, so the assumption fails loudly instead.
 */
export const SUITE_INCLUDE_PATTERN = '**/__tests__/**/*.test.{ts,tsx}'

interface CoverageGlobs {
  include: string[]
  exclude: string[]
}

/**
 * `coverage.include`/`exclude` as configured. Read through a narrow shape rather
 * than the provider-specific union vitest exports, which would need a cast to
 * reach these two fields.
 *
 * That narrowing is this module's UNCOVERED half — 58.33% branches once #80
 * gated it, and the reason the harness pulls web's global branch figure down
 * rather than up. Every arm left unhit is the false side of a type guard:
 * `config.test` is always present, `coverage` always has both keys, and neither
 * `??` ever fires. Removing them would trade an unreachable branch for a cast,
 * which the house rules ban outright — so they stay, uncovered, on purpose.
 *
 * They are not load-bearing at runtime either, and that is checked rather than
 * assumed: if the config ever did lack a coverage block these would answer empty
 * globs, and `coverage-gate.test.ts`'s vacuity case fails on exactly that (#82).
 * The consequence is guarded even where the arm is not exercised.
 */
function coverageGlobs(): CoverageGlobs {
  const coverage = config.test?.coverage
  const include = coverage !== undefined && 'include' in coverage ? coverage.include : undefined
  const exclude = coverage !== undefined && 'exclude' in coverage ? coverage.exclude : undefined
  return { include: include ?? [], exclude: exclude ?? [] }
}

/** The configured suite pattern, for the pin above. */
export function configuredSuiteInclude(): string[] {
  return config.test?.include ?? []
}

/**
 * The two places a vitest config can declare a root, DERIVED from the config's
 * own type rather than hand-written. A hand-written shape would swallow a rename
 * — `config` satisfies an interface whose properties are all optional no matter
 * what it actually has, so the guard would quietly answer "no root declared"
 * forever.
 *
 * WHERE the signal shows up was measured rather than assumed, because it is not
 * where you would expect: picking a name vitest does not have (`'rootDir'`) does
 * NOT fail at the `Pick` itself. It yields a type demanding a property nothing
 * supplies, and the CALL SITES stop compiling — TS2345 and TS2741 in
 * `vitest-gate.test.ts`. So the protection is real but it is carried by that
 * suite's calls; delete them and the rename goes unnoticed again.
 */
type RootBearing = Pick<typeof config, 'root'> & {
  test?: Pick<NonNullable<(typeof config)['test']>, 'root'>
}

/**
 * Any root the config DECLARES, keyed by the field that declares it (#85).
 *
 * Two fields, because both were measured to move the resolved root — see the
 * case in `coverage-gate.test.ts` for how. Returned as a map rather than a
 * boolean so a failure names the field and its value instead of just saying no.
 *
 * Takes the config as a defaulted PARAMETER so both arms can be exercised. Read
 * straight off the import, the "a root is declared" arms would be unreachable
 * while none is — two permanently uncovered branches in a gated module, and a
 * function whose reporting nothing checks. `vitest-gate.test.ts` passes it
 * configs that do declare one.
 */
export function declaredRoots(source: RootBearing = config): Record<string, string> {
  const declared: Record<string, string> = {}
  if (source.root !== undefined) declared.root = source.root
  if (source.test?.root !== undefined) declared['test.root'] = source.test.root
  return declared
}

/**
 * Whether the config declares `test.projects` — a THIRD way a root can enter,
 * since each entry may carry one of its own (#85).
 *
 * Returned raw and guarded rather than parsed: an entry can be a glob string or
 * an inline config, and reading roots out of either would be the resolution
 * logic this module refuses to re-implement. Measured today: none is declared,
 * and vitest resolves exactly one project rooted at the app directory.
 */
export function configuredProjects(): NonNullable<(typeof config)['test']>['projects'] {
  return config.test?.projects
}

/** The configured `coverage.include` list, for the inert-pattern check (#82). */
export function configuredCoverageInclude(): string[] {
  return coverageGlobs().include
}

/**
 * Whether ONE include pattern instruments anything — the matcher behind #82's
 * inert-pattern check.
 *
 * The real `exclude` list is applied alongside the single pattern, deliberately.
 * The question is not "does this glob match a path" but "does this entry
 * contribute anything to the gate", and a pattern whose every match is excluded
 * contributes nothing either. `lib/**` matching only `*.types.ts` files would be
 * as dead as one naming a directory that has moved.
 */
export function patternMatcher(root: string, glob: string): (file: string) => boolean {
  const { exclude } = coverageGlobs()
  const matcher = new TestExclude({ cwd: root, include: [glob], exclude })
  return (file) => matcher.shouldInstrument(path.join(root, file))
}

/** One matcher for many files — building it per call is wasteful at 200+ subjects. */
export function gateMatcher(root: string): (file: string) => boolean {
  const { include, exclude } = coverageGlobs()
  const matcher = new TestExclude({ cwd: root, include, exclude })
  return (file) => matcher.shouldInstrument(path.join(root, file))
}
