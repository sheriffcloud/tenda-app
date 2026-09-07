/**
 * The coverage gate must be able to SEE every file the suite exercises.
 *
 * `collectCoverageFrom` is an allow-list, so an unlisted file contributes
 * nothing to the global figures however well tested it is, and nothing fails
 * when that happens — the number simply describes a smaller app. #49, #51 and
 * #56 each caught one of those by accident, which is not a process.
 *
 * These cases close it: a subject is either inside the gate or recorded in
 * UNGATED_WITH_TESTS, and a recorded entry that has since been gated has to be
 * removed. The register can still grow — but only in a diff someone reads,
 * never by a suite quietly landing on an unlisted file.
 *
 * The gate used to exempt its own machinery, and #75 stopped it. A suite
 * directly under the app root still resolves to no subject — that is a fact
 * about the resolver, not a decision — so `test-support/` was never ASKED to be
 * gated, and nothing measured whether the resolver's 19-case suite still
 * reached its code. It is now listed in the coverage scope with a
 * './test-support/' threshold of its own, which jest subtracts from the app's
 * figures, so the harness is measured at 100 without flattering mobile's 90.
 *
 * The pin at the bottom is split for the same reason. "The resolver could not
 * place this suite" had been one list holding two different facts: suites with
 * no subject to name, and suites whose subject exists and the resolver cannot
 * see. Only the second is a blind spot, and only the second must not grow.
 */
import fs from 'node:fs'
import path from 'node:path'
import { globsToMatcher } from 'jest-util'
import config from '../jest.config'
import { isTestFile } from '@/test-support/jest-test-files'
import { collectTestSubjects } from '@/test-support/coverage-subjects'
import { UNGATED_WITH_TESTS } from '@/test-support/coverage-ungated'

const ROOT = path.join(__dirname, '..')

// The same function jest uses: @jest/transform's shouldInstrument matches
// collectCoverageFrom with globsToMatcher(...) over rootDir-relative paths. A
// lookalike matcher here could disagree with the real gate, which is precisely
// the failure this file exists to prevent.
const scope = config.collectCoverageFrom ?? []
const isGated = globsToMatcher(scope)

const { subjects, sourceFiles, testFiles, unresolved } = collectTestSubjects(ROOT, isTestFile)
const registered = new Set(UNGATED_WITH_TESTS)

/**
 * Unresolved because there is NO subject to name — the harmless half.
 *
 * Each needs a reason, because "the resolver could not place it" is exactly the
 * sentence that would hide the other half.
 */
const NO_SUBJECT_BY_CONSTRUCTION: Record<string, string> = {
  '__tests__/coverage-gate.test.ts':
    'the gate itself — the jest config, the scope register it requires, and the three test-support modules this file imports. Naming any one of them as THE subject would be a fiction',
  '__tests__/harness-parallelism.test.ts': 'about the harness itself, not about any module of the app',
  '__tests__/harness-rtl-smoke.test.tsx': 'about the harness itself, not about any module of the app',
  '__tests__/harness-smoke.test.ts': 'about the harness itself, not about any module of the app',
  'stores/__tests__/account-scope.guard.test.ts':
    'asserts a CONVENTION over the whole stores directory (#65) — its subject IS the directory, so there is no module to name',
}

/**
 * Unresolved because the subject EXISTS and the resolver cannot see it — the
 * half that is a real blind spot, so each entry names the subject it misses
 * rather than giving a prose excuse.
 *
 * `coverage-subjects.test.ts` sits at the app root, so its owner directory is
 * '.', `subjectByName` looks for './coverage-subjects.ts' and finds nothing,
 * and `subjectsByImport` needs a hit under the './' prefix, which no
 * root-relative key has. Fixing the resolver to special-case itself would be
 * the lookalike logic it exists to avoid; measuring the subject anyway is the
 * answer, and the cases below hold it to that.
 */
const SUBJECT_NOT_RESOLVABLE: Record<string, string> = {
  '__tests__/coverage-subjects.test.ts': 'test-support/coverage-subjects.ts',
}

describe('coverage gate scope', () => {
  it('is configured at all — an empty scope would gate nothing and pass everything', () => {
    expect(scope.length).toBeGreaterThan(0)
    expect(testFiles.length).toBeGreaterThan(0)
  })

  it('has no scope pattern that matches nothing', () => {
    // The other half of "the gate cannot see it": a pattern for a path that no
    // longer exists gates nothing and says nothing, so the code it named drops
    // out of the measurement silently when it moves. #48 hit this on web with
    // a Next dynamic segment read as a glob class; #58 found seven here, and
    // every one of them named a module that had moved into @tenda/shared —
    // 623a79c and 686cb76 — with its pattern left behind. Deleting all seven
    // changed the reported figures by nothing at all, which is the proof they
    // were dead.
    //
    // Positive patterns only. A NEGATION that matches nothing is defensive
    // rather than broken — `!wallet/**/*.d.ts` excludes generated typings that
    // are simply absent today — so requiring those to match would be wrong.
    const inert = scope
      .filter((glob) => !glob.startsWith('!'))
      .filter((glob) => !sourceFiles.some(globsToMatcher([glob])))
    expect(inert).toEqual([])
  })

  it('sees every module the suite exercises, or records it as a known exception', () => {
    const unregistered = subjects.filter((file) => !isGated(file) && !registered.has(file))
    expect(unregistered).toEqual([])
  })

  it('keeps no exception for a file that is now gated', () => {
    const stale = UNGATED_WITH_TESTS.filter((file) => isGated(file))
    expect(stale).toEqual([])
  })

  it('keeps no exception for a file that no longer exists', () => {
    const missing = UNGATED_WITH_TESTS.filter((file) => !fs.existsSync(path.join(ROOT, file)))
    expect(missing).toEqual([])
  })

  it('keeps no exception for a file the suite no longer exercises', () => {
    // An exemption outlives its reason the moment the suite behind it is
    // deleted or renamed. Without this the list would accumulate entries that
    // exempt nothing, and its own count of what is ungated would stop being
    // true.
    const exercised = new Set(subjects)
    const idle = UNGATED_WITH_TESTS.filter((file) => !exercised.has(file))
    expect(idle).toEqual([])
  })

  it('measures against the same root jest does', () => {
    // ROOT is __dirname/.. because jest defaults rootDir to the directory
    // holding the config file (jest-config/readConfigFileAndSetRootDir, the
    // `else` at the end), and shouldInstrument matches collectCoverageFrom
    // against paths relative to THAT.
    //
    // This trips on ANY explicit rootDir, including one that resolves to the
    // same directory — jest resolves a relative value against the config's own
    // dirname, so `rootDir: '.'` is harmless and still fails here. That is the
    // intent: re-implementing jest's resolution to tell the harmless case from
    // the breaking one is the kind of lookalike logic this file exists to
    // avoid. Setting rootDir should mean re-reading these paths by hand.
    expect(config.rootDir).toBeUndefined()
  })

  it('leaves testMatch to speak for itself, with no testRegex beside it', () => {
    // The one place test-support/jest-test-files.ts stops mirroring jest:
    // normalize.js sets `testMatch = []` when testRegex is configured and
    // testMatch is not, so jest would select tests by regex alone while that
    // module would still be using the default globs — and every suite in the
    // app would then look like ordinary source.
    //
    // Guarded rather than re-implemented, for the same reason as rootDir: a
    // second copy of jest's precedence rules is the drift this file exists to
    // catch. Adding testRegex should mean coming back here.
    expect(config.testRegex).toBeUndefined()
  })

  it('has something to classify — the partition must not pass vacuously', () => {
    // Every case below compares a register against `unresolved`, so a resolver
    // that returned an empty list would satisfy all of them while measuring
    // nothing — the same failure the scope case above guards against.
    //
    // Anchored on the NO-SUBJECT half, not the other one. The harness suites
    // can never resolve to a subject, so that group emptying means the resolver
    // broke; SUBJECT_NOT_RESOLVABLE legitimately CAN empty — teach the resolver
    // to see its own suite and it should — so anchoring there would fail the
    // day someone did the right thing.
    expect(unresolved.length).toBeGreaterThan(0)
    expect(Object.keys(NO_SUBJECT_BY_CONSTRUCTION).length).toBeGreaterThan(0)
  })

  it('accounts for every unresolved suite, under exactly one of the two reasons', () => {
    // Pinned and PARTITIONED (#75): a suite the resolver cannot place is a
    // suite whose subject stays invisible to the gate, so the blind spot has to
    // be bounded rather than tolerated — and bounding it means saying which
    // kind each one is. A new unresolved suite fails here until it is
    // classified in a diff someone reads.
    const classified = [
      ...Object.keys(NO_SUBJECT_BY_CONSTRUCTION),
      ...Object.keys(SUBJECT_NOT_RESOLVABLE),
    ].sort()
    expect(classified).toEqual(unresolved)
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

  it('names a subject that EXISTS for every suite the resolver misses', () => {
    // A named subject that has been moved or deleted would leave the entry
    // excusing nothing, which is how the ungated register would rot too.
    const missing = Object.values(SUBJECT_NOT_RESOLVABLE).filter(
      (subject) => !fs.existsSync(path.join(ROOT, subject)),
    )
    expect(missing).toEqual([])
  })

  it('GATES every subject the resolver misses — it may not also go unmeasured', () => {
    // The point of the whole split. The resolver not seeing a subject is
    // survivable; the subject going unmeasured is not, and before #75 that is
    // exactly what had happened — the module deciding what the gate measures
    // was itself outside the gate.
    const unmeasured = Object.entries(SUBJECT_NOT_RESOLVABLE)
      .filter(([, subject]) => !isGated(subject))
      .map(([file, subject]) => `${file} -> ${subject}`)
    expect(unmeasured).toEqual([])
  })
})
