/**
 * @vitest-environment node
 *
 * The coverage gate measures what the suite exercises.
 *
 * `coverage.include` is an allow-list, so a file outside it contributes nothing
 * to the reported figures even with a full suite. Nothing failed when that
 * happened — which is how nine route pages under app/(app)/ came to have real
 * cases whose subject could not move the number (#69, the web half of #58).
 *
 * These cases close that: a new suite on an unlisted module fails here, and the
 * register of deliberate exceptions cannot rot.
 *
 * #82 closed the OTHER half. A pattern naming a path that has moved gates
 * nothing and says nothing, so the code it named leaves the measurement in
 * silence — mobile had seven of those when #58 looked. One now fails here too.
 *
 * NODE environment, pinned above rather than worked around: this walks the app
 * tree and asks vitest's own coverage matcher about paths, and under the
 * project's default jsdom `test-exclude` trips jsdom's TextEncoder invariant
 * before a single case runs.
 */
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectTestSubjects, isTestSupport } from '../test-support/coverage-subjects'
import { UNGATED_BUT_EXERCISED } from '../test-support/coverage-ungated'
import {
  SUITE_INCLUDE_PATTERN,
  configuredCoverageInclude,
  configuredProjects,
  configuredSuiteInclude,
  declaredRoots,
  gateMatcher,
  patternMatcher,
} from '../test-support/vitest-gate'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const { sourceFiles, subjects, testFiles, unresolved } = collectTestSubjects(ROOT)
const isGated = gateMatcher(ROOT)
const registered = new Set(Object.keys(UNGATED_BUT_EXERCISED))

/**
 * Unresolved because there is NO subject to name — the harmless half.
 *
 * Each needs a reason, because "the resolver could not place it" is exactly the
 * sentence that would hide the other half.
 */
const NO_SUBJECT_BY_CONSTRUCTION: Record<string, string> = {
  '__tests__/coverage-gate.test.ts':
    'the gate itself — the vitest config it reaches through vitest-gate, plus the three test-support modules this file imports. Naming any one of them as THE subject would be a fiction',
  '__tests__/coverage-resolver-parity.test.ts':
    "its subject is the RELATIONSHIP between this app's resolver and mobile's (#77), which is not a module",
  'app/(public)/support/__tests__/support-routes.test.ts':
    'asserts a route manifest over a directory — the contract, not any one page',
  'stores/__tests__/account-scope.guard.test.ts':
    'asserts a CONVENTION over the whole stores directory (#65) — its subject IS the directory',
  'styles/__tests__/motion-contract.test.ts': 'a style contract over generated tokens, not a module',
  'styles/__tests__/panes-contract.test.ts': 'a style contract over generated tokens, not a module',
  'styles/__tests__/type-atoms.guard.test.ts':
    'asserts a CONVENTION over the whole app tree (#63: every text size is a type-* atom, or registered with a reason) and a sort-order contract on the compiled stylesheet — its subject is the tree',
  'wallet/__tests__/config-guard.test.ts':
    'guards the wallet CONFIG against the chain manifest — a cross-file invariant with no single owner',
}

/**
 * Unresolved because the subject EXISTS and the resolver cannot see it — the
 * half that is a real blind spot, so each entry names the subject it misses
 * rather than giving a prose excuse.
 *
 * Mobile's equivalent register carries its resolver suite (it sits at the APP
 * ROOT, where the owner is '.' and nothing can resolve). Web's resolver suites
 * (test-support/__tests__/, #84) sit beside the module they test and resolve
 * BY NAME, so they need no entry — the register held only suites whose NAME
 * deliberately differs from their subject's.
 */
const SUBJECT_NOT_RESOLVABLE: Record<string, string> = {
  // #24 follow-up: asserts networks.ts's module-INIT contract, so it needs its
  // own file (fresh import per case) — the resolver cannot walk "-init" back.
  'wallet/reown/__tests__/networks-init.test.ts': 'wallet/reown/networks.ts',
}

describe('coverage gate scope', () => {
  it('resolves a scope that is not empty — the check must not pass vacuously', () => {
    // Anchored on a module that must exist rather than on a count, which would
    // be a second thing to maintain. Without this the whole file could report
    // success having compared two empty sets.
    expect(testFiles.length).toBeGreaterThan(100)
    expect(subjects).toContain('hooks/gig/useModerationPreview.ts')
    // And the SCOPE itself, which this case was named for and did not check
    // (#82). Emptying `coverage.include` turned all nine cases in this file
    // green — measured, not reasoned about. The mechanism was measured too,
    // because the first guess at it was wrong: `test-exclude` does not fall back
    // to a `**` default, it resolves an empty list to `include: false` and drops
    // the include filter altogether (probed: `new TestExclude({ include: [] })`
    // reports `include === false` and instruments everything). So every file
    // reads as gated, every subject looks registered, and the inert-pattern
    // check below has nothing to iterate. A gate measuring everything and a gate
    // measuring nothing both pass; only this line tells them apart.
    expect(configuredCoverageInclude().length).toBeGreaterThan(0)
  })

  it('has no coverage.include pattern that instruments nothing', () => {
    // The OTHER half of "the gate cannot see it" (#82), and the half web had no
    // check for. A pattern naming a path that no longer exists gates nothing and
    // says nothing, so the code it named drops out of the measurement silently
    // when it moves. #58 found SEVEN of those on mobile, every one naming a
    // module that had gone to @tenda/shared with its pattern left behind;
    // deleting all seven changed the reported figures by nothing at all, which
    // is what proved they were dead.
    //
    // NO NEGATION FILTER, unlike mobile's version. jest's `collectCoverageFrom`
    // mixes positive globs and `!` exclusions in one list, so mobile has to skip
    // the latter — a defensive `!wallet/**/*.d.ts` legitimately matches nothing.
    // vitest keeps exclusions in a separate `coverage.exclude` array, so this
    // list is positive by construction — measured, and not one entry starts with
    // `!`. Copying the filter across would be a guard no mutation could kill.
    // (No count is quoted: #80 added an entry immediately after #82 measured
    // one, and a number in prose that nothing checks drifts exactly like that.)
    //
    // NO VACUITY GUARD either, for the same reason and checked the same way: an
    // empty `sourceFiles` does not make this pass quietly, it makes EVERY
    // pattern look inert and the case fails naming every one of them. Measured
    // by stubbing the resolver to return none. Every entry was alive when #82
    // landed — unlike mobile, which had seven dead ones when #58 looked.
    const inert = configuredCoverageInclude().filter(
      (glob) => !sourceFiles.some(patternMatcher(ROOT, glob)),
    )
    expect(inert).toEqual([])
  })

  it('calls a pattern dead when its every match is EXCLUDED, not just when none exists', () => {
    // Why `patternMatcher` applies `coverage.exclude` alongside the single glob,
    // proved here rather than left as an unexercised design choice. The check
    // above asks "does this entry contribute anything to the gate", and an entry
    // matching only files the exclude list removes contributes nothing — it is
    // as dead as one naming a directory that has moved.
    //
    // `**/*.d.ts` is the case that exists to test it with: real files match it
    // (test-support/test-exclude.d.ts among them), and `coverage.exclude`
    // removes every one. Anchored on that first, so a repo with no .d.ts left
    // would fail here rather than pass on an empty `some`.
    expect(sourceFiles.some((file) => file.endsWith('.d.ts'))).toBe(true)
    expect(sourceFiles.some(patternMatcher(ROOT, '**/*.d.ts'))).toBe(false)
    // The positive half, so this cannot pass by patternMatcher answering false
    // to everything.
    expect(sourceFiles.some(patternMatcher(ROOT, 'lib/**/*.ts'))).toBe(true)
  })

  it('instruments no fixture and no manual mock, whatever the include list reaches', () => {
    // What #83 fixed, pinned through the REAL matcher rather than by reading the
    // exclude list back to itself. `hooks/pagination/__fixtures__/list-fixtures.ts`
    // was in the coverage report at 17 statements, 100% covered, because
    // `hooks/**/*.ts` reaches it — a harness file flattering the app's figure.
    //
    // Anchored on that file BY NAME, and not merely on the set being non-empty.
    // The other fixture directory (components/gig/) is reached by no include glob
    // at all, so a case that happened to see only that one would pass whether or
    // not the exclude existed — a vacuity guard counting files would not have
    // caught that, and this one does.
    //
    // `__mocks__` is stated by the rule, not pinned by it: no such directory
    // exists today, so nothing here can hold that entry in place. That is the
    // point of reusing the resolver's own `isTestSupport` rather than restating
    // its two directory names as a third copy of the rule — the first
    // manual mock anybody adds is caught on the day it lands.
    const support = sourceFiles.filter(isTestSupport)
    expect(support).toContain('hooks/pagination/__fixtures__/list-fixtures.ts')
    expect(support.filter((file) => isGated(file))).toEqual([])
  })

  it('sees every module the suite exercises, or records it as a known exception', () => {
    const unregistered = subjects.filter((file) => !isGated(file) && !registered.has(file))
    expect(unregistered).toEqual([])
  })

  it('keeps no exception for a file that is now gated', () => {
    expect([...registered].filter((file) => isGated(file))).toEqual([])
  })

  it('keeps no exception for a file that no longer exists', () => {
    expect([...registered].filter((file) => !existsSync(path.join(ROOT, file)))).toEqual([])
  })

  it('keeps no exception for a file nothing exercises any more', () => {
    expect([...registered].filter((file) => !subjects.includes(file))).toEqual([])
  })

  it('gives every exception a REASON, not just an entry', () => {
    // Reported as the offending NAMES rather than a bare length assertion, so a
    // failure says which file is excused without saying why.
    const unexplained = Object.entries(UNGATED_BUT_EXERCISED)
      .filter(([, reason]) => reason.trim().length <= 20)
      .map(([file]) => file)
    expect(unexplained).toEqual([])
  })

  it('still matches the suite pattern the resolver assumes', () => {
    // The resolver walks `__tests__/**/*.test.{ts,tsx}` structurally rather than
    // through vitest's own matcher (tinyglobby, not cheaply importable here), so
    // the assumption is PINNED against the config. Change the pattern and this
    // fails loudly, instead of the resolver quietly reading the wrong file set.
    expect(configuredSuiteInclude()).toEqual([SUITE_INCLUDE_PATTERN])
  })

  it('measures against the same root vitest does', () => {
    // Every case here assumes ROOT — this file's directory, twice up — is the
    // tree vitest measures. A divergence would not error: the inert-pattern
    // check would call live patterns dead, `gates its OWN machinery` would stop
    // finding test-support/, and the subject comparison would be built from two
    // roots.
    //
    // MEASURED on vitest 3.2.6, not inferred from jest. `createVitest` reports
    // that a top-level `root` and a `test.root` each move `config.root`, so both
    // are checked; running with one set wrote the report to app/coverage/ holding
    // ZERO files. Fails on a root resolving to the SAME directory too, as
    // mobile's rootDir case does — telling the harmless spelling from the
    // breaking one means re-implementing vitest's resolution.
    //
    // toStrictEqual: `toEqual` counts { root: undefined } as {} (measured), so a
    // declaredRoots that assigned unconditionally would slip past it.
    //
    // LIMIT: a root moving the tree out of reach ('./app') leaves this suite
    // undiscovered rather than failing — caught by the test count, not here.
    expect(declaredRoots()).toStrictEqual({})
    // A `projects` entry can carry a root of its own — a third way in, guarded
    // rather than parsed for the reason vitest-gate records.
    expect(configuredProjects()).toBeUndefined()
  })

  it('gates its OWN machinery — the modules deciding what everything else measures', () => {
    // What locks #80 in. Removing `test-support/*.ts` from the scope would
    // otherwise undo it in silence: no pattern goes dead, the thresholds barely
    // move, and the gate quietly stops measuring the code that defines the gate.
    // Mobile is held to this by its SUBJECT_NOT_RESOLVABLE entry naming the
    // resolver; web's register carries no test-support entry (its resolver
    // suites resolve by name), so the lock has to be its own case.
    //
    // Derived from the tree rather than a hand-listed trio, so a fourth module
    // added beside them is covered the day it appears. `.d.ts` is excluded
    // because `coverage.exclude` excludes it and it has nothing to execute.
    const harness = sourceFiles.filter(
      (file) => file.startsWith('test-support/') && !file.endsWith('.d.ts'),
    )
    expect(harness.length).toBeGreaterThan(0)
    expect(harness.filter((file) => !isGated(file))).toEqual([])
  })

  it('accounts for every unresolved suite, under exactly one of the two reasons', () => {
    // Pinned and PARTITIONED (#80): a suite the resolver cannot place is a suite
    // whose subject stays invisible to the gate, so the blind spot has to be
    // bounded rather than tolerated — and bounding it means saying which kind
    // each one is. A new unresolved suite fails here until it is classified in a
    // diff someone reads.
    const classified = [
      ...Object.keys(NO_SUBJECT_BY_CONSTRUCTION),
      ...Object.keys(SUBJECT_NOT_RESOLVABLE),
    ].sort()
    expect(classified).toEqual(unresolved)
  })

  it('has something to classify — the partition must not pass vacuously', () => {
    // The case above compares two lists; a resolver returning nothing would
    // satisfy it while measuring nothing. Anchored on the NO-SUBJECT half,
    // which cannot legitimately empty — the harness suites will always be
    // there — rather than on the other, which SHOULD empty and today does.
    expect(unresolved.length).toBeGreaterThan(0)
    expect(Object.keys(NO_SUBJECT_BY_CONSTRUCTION).length).toBeGreaterThan(0)
  })

  it('files no suite under BOTH reasons — they are opposites, not tags', () => {
    const both = Object.keys(SUBJECT_NOT_RESOLVABLE).filter(
      (file) => file in NO_SUBJECT_BY_CONSTRUCTION,
    )
    expect(both).toEqual([])
  })

  it('gives every no-subject suite a REASON, not just an entry', () => {
    const unexplained = Object.entries(NO_SUBJECT_BY_CONSTRUCTION)
      .filter(([, reason]) => reason.trim().length <= 20)
      .map(([file]) => file)
    expect(unexplained).toEqual([])
  })

  it('names a subject that EXISTS, and is GATED, for every suite the resolver misses', () => {
    // The point of the split. The resolver not seeing a subject is survivable;
    // the subject going unmeasured is not — that is exactly what #80 found for
    // test-support itself. Both halves asserted together: a named subject that
    // has moved excuses nothing, and one that is not gated is the blind spot
    // rather than a record of it.
    const broken = Object.entries(SUBJECT_NOT_RESOLVABLE)
      .filter(([, subject]) => !existsSync(path.join(ROOT, subject)) || !isGated(subject))
      .map(([file, subject]) => `${file} -> ${subject}`)
    expect(broken).toEqual([])
  })

})
