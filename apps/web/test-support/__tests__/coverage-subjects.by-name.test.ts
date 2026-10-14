/**
 * @vitest-environment node
 *
 * What the resolver decides a suite is testing, BY NAME (#84).
 *
 * `coverage-gate.test.ts` runs `collectTestSubjects` against the real app, and
 * that is a measurement rather than an assertion: the walk touches nearly every
 * arm of this module incidentally, so the file reported 99.13% statements with
 * NOTHING checking what it resolved. A regression that quietly picked the wrong
 * subject for a whole class of suites would hold those percentages and fail no
 * test. These cases are what make the percentage mean something.
 *
 * Fixture trees, not the app, because the inputs that matter are the ones
 * nobody has written yet. Several suites here reach their subject through a
 * HARNESS instead of importing it, which is what makes them by-name cases at
 * all — import the subject directly and the by-import fallback returns the same
 * answer, so the case passes with name resolution disabled entirely (measured).
 *
 * DUPLICATED FROM apps/mobile/__tests__/coverage-subjects.test.ts as a map, not
 * as a copy: the resolvers differ at the runner seam (#77), so two cases here
 * assert the OPPOSITE of mobile's and say why. Web takes no test-file matcher —
 * it pins vitest's single `__tests__`-rooted pattern structurally — where mobile
 * is handed jest's `globsToMatcher(testMatch)` and its two patterns.
 *
 * NODE environment, like the gate suite: this walks real directories and needs
 * no DOM, and jsdom's TextEncoder invariant trips `test-exclude` first.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { collectTestSubjects } from '../coverage-subjects'
import { cleanupTrees, tree } from './tree'

afterAll(cleanupTrees)

describe('collectTestSubjects — by name', () => {
  it('resolves a suite named for its module, in either extension', () => {
    // Both suites reach their subject through a HARNESS rather than importing
    // it, so the name is the only signal that can answer. Written the obvious
    // way — importing the subject directly — the by-import fallback returns the
    // same two files and the case passes with by-name resolution disabled
    // entirely. Measured: that mutant survived until the harness went in.
    const root = tree({
      'hooks/useFoo.ts': 'export const useFoo = () => null',
      'hooks/__fixtures__/hooks-harness.ts': "export { useFoo } from '../useFoo'",
      'hooks/__tests__/useFoo.test.ts': "import { useFoo } from '../__fixtures__/hooks-harness'",
      'components/Bar.tsx': 'export const Bar = () => null',
      'components/__fixtures__/ui-harness.ts': "export { Bar } from '../Bar'",
      'components/__tests__/Bar.test.tsx': "import { Bar } from '../__fixtures__/ui-harness'",
    })
    expect(collectTestSubjects(root).subjects).toEqual(['components/Bar.tsx', 'hooks/useFoo.ts'])
  })

  it('resolves a split suite through its suffix, one segment at a time', () => {
    // `useFoo.races.test.ts` -> stem `useFoo.races` -> no such module -> strip
    // at the last dot -> `useFoo`. The halves reach their subject through a
    // harness instead of importing it, so the NAME is the only signal left —
    // with the subject imported directly the by-import fallback would answer
    // correctly anyway and the case would pass whether stripping worked or not.
    //
    // This is not a hypothetical layout: all three suite files in this very
    // directory are named `coverage-subjects.<something>.test.ts`, and each
    // reaches its own subject through exactly this walk.
    const root = tree({
      'hooks/useFoo.ts': 'export const useFoo = () => null',
      'hooks/__fixtures__/harness.ts': "export { useFoo } from '../useFoo'",
      'hooks/__tests__/useFoo.races.test.ts': "import { useFoo } from '../__fixtures__/harness'",
      'hooks/__tests__/useFoo.cache.slow.test.ts': "import { useFoo } from '../__fixtures__/harness'",
    })
    expect(collectTestSubjects(root).subjects).toEqual(['hooks/useFoo.ts'])
  })

  it('claims nothing for a name that strips to an empty stem', () => {
    // `.foo.test.ts` leaves the stem `.foo`, whose only dot is at index 0. The
    // boundary between "strip again" and "give up", and the reason the loop
    // exits on `<= 0` rather than `< 0` — a detail #77's parity suite keeps
    // byte-identical with mobile's copy, so it is worth a case on both sides.
    const root = tree({
      'hooks/useFoo.ts': 'export const useFoo = () => null',
      'hooks/__tests__/.foo.test.ts': "import { useFoo } from '@/lib/missing'",
    })
    const { subjects, unresolved } = collectTestSubjects(root)
    expect(subjects).toEqual([])
    expect(unresolved).toEqual(['hooks/__tests__/.foo.test.ts'])
  })

  it('does NOT count the neighbours a named suite renders', () => {
    // The ORDERING, which is the design and not an optimisation. By-import is
    // the fallback; applied to a suite that already resolved by name it
    // re-labels every shared component the subject happens to render. Measured
    // on mobile's real tree when it ran unconditionally: Button, Text, Chip and
    // SectionLabel all became "subjects" of the ui suites. A collaborator is
    // not a subject.
    const root = tree({
      'ui/Chip.tsx': 'export const Chip = () => null',
      'ui/Button.tsx': 'export const Button = () => null',
      'ui/__tests__/Chip.test.tsx': "import { Chip } from '../Chip'\nimport { Button } from '../Button'",
    })
    expect(collectTestSubjects(root).subjects).toEqual(['ui/Chip.tsx'])
  })

  it('does NOT treat a suite written beside its subject as a suite at all', () => {
    // WEB DIVERGES FROM MOBILE HERE, and the divergence is correct rather than
    // a gap. jest's testMatch has two patterns, so `hooks/useFoo.test.ts` is a
    // suite there (#71 exists because the resolver once honoured only one of
    // them). Vitest declares ONE pattern, `**/__tests__/**/*.test.{ts,tsx}`,
    // which this resolver pins structurally — so the same file would never run
    // as a test here, and calling it one would make the gate demand a subject
    // for something vitest ignores.
    //
    // Asserted with `sourceFiles` too, because that is where the file DOES
    // land: not being a suite, it reads as ordinary instrumentable code.
    const root = tree({
      'hooks/useFoo.ts': 'export const useFoo = () => null',
      'hooks/useFoo.test.ts': "import { useFoo } from './useFoo'",
    })
    const { subjects, testFiles, sourceFiles } = collectTestSubjects(root)
    expect(testFiles).toEqual([])
    expect(subjects).toEqual([])
    expect(sourceFiles).toEqual(['hooks/useFoo.test.ts', 'hooks/useFoo.ts'])
  })

  it('does NOT treat a .spec file as a suite, which is the config again', () => {
    // Mobile resolves `.spec.ts` because jest matches it. Web's suite pattern
    // says `*.test.{ts,tsx}`, so a `.spec.ts` runs as no test here. It is not
    // offered as source either — it sits inside `__tests__`, which the source
    // filter drops wholesale — so it is simply invisible, which is the honest
    // answer for a file the runner ignores.
    const root = tree({
      'hooks/useFoo.ts': 'export const useFoo = () => null',
      'hooks/__tests__/useFoo.spec.ts': "import { useFoo } from '../useFoo'",
    })
    const { subjects, testFiles, sourceFiles } = collectTestSubjects(root)
    expect(testFiles).toEqual([])
    expect(subjects).toEqual([])
    expect(sourceFiles).toEqual(['hooks/useFoo.ts'])
  })
})
