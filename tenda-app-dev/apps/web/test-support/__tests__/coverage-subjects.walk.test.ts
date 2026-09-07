/**
 * @vitest-environment node
 *
 * What the resolver WALKS, and what it offers as gateable source (#84).
 *
 * The third of the three suite files in this directory, and the only one not
 * about resolution: `coverage-subjects.by-name` and `.by-import` ask what a suite is
 * TESTING, this one asks which files exist as far as the gate is concerned.
 *
 * All three names reach the same subject through the resolver's own
 * suffix-stripping walk (`coverage-subjects.walk` -> `coverage-subjects`),
 * which is dogfooding rather than coincidence — the split exists to keep each
 * file well inside the 300-line house limit, and it exercises the production
 * path that makes such splits resolvable at all.
 *
 * `sourceFiles` is the half that decides whether a `coverage.include` pattern
 * is DEAD (#82): a pattern is inert when nothing in this set matches it. Get
 * the set wrong and the inert-pattern check either misses a dead entry or
 * fails on a live one.
 *
 * NODE environment, for the reason its sibling records.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { collectTestSubjects } from '../coverage-subjects'
import { cleanupTrees, tree } from './tree'

afterAll(cleanupTrees)

describe('collectTestSubjects — what it walks', () => {
  it('skips dependencies, build output and reports', () => {
    // Every name in SKIPPED_DIRECTORIES that can hold a `.ts`, so a vendored
    // or generated suite cannot become a subject and its modules cannot become
    // gateable source. `.next/` and `playwright-report/` are the two this app
    // has that mobile's copy does not.
    const root = tree({
      'hooks/useFoo.ts': 'export const useFoo = () => null',
      'hooks/__tests__/useFoo.test.ts': "import { useFoo } from '../useFoo'",
      'node_modules/pkg/thing.ts': 'export const thing = {}',
      'node_modules/pkg/__tests__/thing.test.ts': "import { thing } from '../thing'",
      '.next/types/route.ts': 'export const route = {}',
      '.next/types/__tests__/route.test.ts': "import { route } from '../route'",
      'coverage/lcov-report/x.ts': 'export const x = {}',
      'coverage/lcov-report/__tests__/x.test.ts': "import { x } from '../x'",
      'test-results/run/y.ts': 'export const y = {}',
      'playwright-report/data/z.ts': 'export const z = {}',
    })
    const { subjects, testFiles, sourceFiles } = collectTestSubjects(root)
    expect(subjects).toEqual(['hooks/useFoo.ts'])
    expect(testFiles).toEqual(['hooks/__tests__/useFoo.test.ts'])
    expect(sourceFiles).toEqual(['hooks/useFoo.ts'])
  })

  it('does NOT skip e2e, which is hand-written source like any other', () => {
    // Recorded in the resolver as a measured decision rather than an oversight:
    // e2e specs sit at the folder root as `*.spec.ts` with no `__tests__`
    // directory, so the walk already ignores them as suites and nothing under
    // it can resolve as a subject. Its helpers ARE ordinary modules though, and
    // a coverage pattern naming them would be live, so they must stay visible.
    const root = tree({
      'e2e/fixtures.ts': 'export const fixture = {}',
      'e2e/public-discovery.spec.ts': "import { fixture } from './fixtures'",
    })
    const { subjects, testFiles, sourceFiles } = collectTestSubjects(root)
    expect(testFiles).toEqual([])
    expect(subjects).toEqual([])
    expect(sourceFiles).toEqual(['e2e/fixtures.ts', 'e2e/public-discovery.spec.ts'])
  })

  it('offers no suite, and nothing beside one, as gateable source', () => {
    // The whole `__tests__` directory is out: `coverage.exclude` drops it, so a
    // pattern matching only those files instruments nothing and must read as
    // dead. A helper sitting beside a suite goes with it.
    const root = tree({
      'hooks/useFoo.ts': 'export const useFoo = () => null',
      'components/Bar.tsx': 'export const Bar = () => null',
      'hooks/__tests__/useFoo.test.ts': "import { useFoo } from '../useFoo'",
      'hooks/__tests__/seed.ts': 'export const seed = () => null',
      'assets/logo.png': 'binary',
      'README.md': 'notes',
    })
    expect(collectTestSubjects(root).sourceFiles).toEqual([
      'components/Bar.tsx',
      'hooks/useFoo.ts',
    ])
  })

  it('KEEPS fixtures and mocks as source candidates, though never as subjects', () => {
    // The deliberate split from mobile, and the one most likely to be "tidied"
    // by someone reading both files (#83).
    //
    // As SUBJECTS they are refused on both sides: a fixture is test data, and
    // mobile's #65 measured the harm when one became a subject — the gate then
    // demanded that a file of test data be instrumented, which would measure
    // the harness and inflate the figure the gate reports.
    //
    // As source CANDIDATES web keeps them and mobile drops them, because web's
    // `patternMatcher` applies `coverage.exclude` per pattern: an include entry
    // whose only matches are fixtures is dead, and the inert-pattern check can
    // only say so if the fixtures are still in this set to be matched. Filter
    // them out here and that entry would vanish from the set and read as alive.
    const root = tree({
      'stores/chat.store.ts': 'export const useChatStore = {}',
      'stores/__fixtures__/chat.ts': 'export const conversation = () => ({})',
      'stores/__mocks__/secure-store.ts': 'export const getToken = () => null',
      'stores/__tests__/account-switch.test.ts':
        "import { useChatStore } from '../chat.store'\n" +
        "import { conversation } from '../__fixtures__/chat'\n" +
        "import { getToken } from '../__mocks__/secure-store'",
    })
    const { subjects, sourceFiles } = collectTestSubjects(root)
    expect(subjects).toEqual(['stores/chat.store.ts'])
    expect(sourceFiles).toEqual([
      'stores/__fixtures__/chat.ts',
      'stores/__mocks__/secure-store.ts',
      'stores/chat.store.ts',
    ])
  })

  it('counts only .test files as suites, not every file under __tests__', () => {
    const root = tree({
      'hooks/useFoo.ts': 'export const useFoo = () => null',
      'hooks/__tests__/useFoo.test.ts': "import { useFoo } from '../useFoo'",
      'hooks/__tests__/fixtures.json': '{}',
      'hooks/__tests__/README.md': 'notes',
    })
    expect(collectTestSubjects(root).testFiles).toEqual(['hooks/__tests__/useFoo.test.ts'])
  })
})
