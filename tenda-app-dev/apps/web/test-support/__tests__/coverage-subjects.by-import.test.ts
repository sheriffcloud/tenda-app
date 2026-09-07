/**
 * @vitest-environment node
 *
 * The by-import FALLBACK, what the resolver gives up on, and the one layout
 * that changes which directory a suite is judged to OWN (#84).
 *
 * A suite named for a theme rather than a module declares its subjects by
 * importing them. The unresolved cases share this file because they are mostly
 * that failing: a suite lands in `unresolved` precisely when neither signal
 * answers, and the gate's partition then forces somebody to classify it rather
 * than letting it pass unnoticed.
 *
 * The ordering is the design, and it is pinned next door in the by-name file:
 * by-import runs ONLY when by-name found nothing. Applied to every suite it
 * re-labels every shared component a sibling happens to render.
 *
 * Split from the by-name cases because one file holding both ran to 291 lines
 * against a 300-line house limit — nine from the edge, which is the margin #86
 * exists to record.
 *
 * The third block is `ownerOf`'s second arm. It gets a block of its own rather
 * than joining the unresolved cases because one of its two answers is a
 * RESOLVED subject — filing it under "what it reports as unresolved" would have
 * put a case asserting an empty `unresolved` list inside the block named for
 * that list being full.
 *
 * NODE environment, for the reason the by-name file states.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { collectTestSubjects } from '../coverage-subjects'
import { cleanupTrees, tree } from './tree'

afterAll(cleanupTrees)

describe('collectTestSubjects — by import, for suites named after a theme', () => {
  it('resolves through the alias, a relative specifier and vi.mock', () => {
    // `vi.mock` is in the specifier pattern because a suite names a module by
    // mocking it as surely as by importing it — and it is the one token in
    // that regex that differs from mobile's, which reads `jest.mock`.
    const root = tree({
      'stores/realtime.store.ts': 'export const store = {}',
      'stores/chat.store.ts': 'export const chat = {}',
      'stores/mocked.store.ts': 'export const mocked = {}',
      'stores/__tests__/mirror.test.ts':
        "vi.mock('@/stores/mocked.store')\n" +
        "import { store } from '@/stores/realtime.store'\n" +
        "import { chat } from '../chat.store'",
    })
    expect(collectTestSubjects(root).subjects).toEqual([
      'stores/chat.store.ts',
      'stores/mocked.store.ts',
      'stores/realtime.store.ts',
    ])
  })

  it('reaches a subject one directory below the owner', () => {
    // Anywhere UNDER the owning directory, not just directly in it — a route
    // suite reaches its own page and the segments below it. Escaped brackets
    // are not needed here: this is path containment, not a glob.
    const root = tree({
      'app/wallet/intents/[id]/page.tsx': 'export default () => null',
      'app/wallet/__tests__/intent.test.tsx': "import Page from '../intents/[id]/page'",
    })
    expect(collectTestSubjects(root).subjects).toEqual(['app/wallet/intents/[id]/page.tsx'])
  })

  it('resolves a directory specifier to its index barrel', () => {
    const root = tree({
      'api/client/index.ts': 'export const api = {}',
      'api/client/__tests__/wiring.test.ts': "import { api } from '@/api/client'",
    })
    expect(collectTestSubjects(root).subjects).toEqual(['api/client/index.ts'])
  })

  it('refuses a module OUTSIDE the owning directory — that is a collaborator', () => {
    const root = tree({
      'stores/realtime.store.ts': 'export const store = {}',
      'lib/ws.ts': 'export const ws = {}',
      'stores/__tests__/mirror.test.ts':
        "import { store } from '../realtime.store'\nimport { ws } from '../../lib/ws'",
    })
    expect(collectTestSubjects(root).subjects).toEqual(['stores/realtime.store.ts'])
  })

  it('refuses a bare specifier even when it collides with a real path', () => {
    // `'stores/seed'` is a PACKAGE specifier — this app reaches its own modules
    // through `@/` or a relative path, never bare. Spelled to collide with a
    // real file INSIDE the owning directory on purpose: a fixture with nothing
    // to collide with would pass whether the rule were enforced or not.
    const root = tree({
      'stores/seed.ts': 'export const seed = () => null',
      'stores/realtime.store.ts': 'export const store = {}',
      'stores/__tests__/mirror.test.ts':
        "import { seed } from 'stores/seed'\nimport { store } from '../realtime.store'",
    })
    expect(collectTestSubjects(root).subjects).toEqual(['stores/realtime.store.ts'])
  })

  it('never counts another suite, or a helper beside one, as a subject', () => {
    const root = tree({
      'stores/__tests__/helpers.ts': 'export const seed = () => null',
      'stores/__tests__/mirror.test.ts': "import { seed } from './helpers'",
    })
    const { subjects, unresolved } = collectTestSubjects(root)
    expect(subjects).toEqual([])
    expect(unresolved).toEqual(['stores/__tests__/mirror.test.ts'])
  })
})

describe('collectTestSubjects — what it reports as unresolved', () => {
  it('claims no subject for a suite at the app root', () => {
    // A root suite owns no module directory, so containment refuses everything
    // it imports: the owner is '.', the prefix is './', and no root-relative
    // key starts that way. Without it the harness suites, which reach for the
    // config and half the app, would claim all of it as their subjects.
    const root = tree({
      'vitest.config.ts': 'export default {}',
      'app/page.tsx': 'export default () => null',
      '__tests__/harness.test.ts': "import config from '../vitest.config'\nimport Page from '@/app/page'",
    })
    const { subjects, unresolved } = collectTestSubjects(root)
    expect(subjects).toEqual([])
    expect(unresolved).toEqual(['__tests__/harness.test.ts'])
  })

  it('claims no subject rather than guessing when nothing resolves', () => {
    const root = tree({
      'hooks/useFoo.ts': 'export const useFoo = () => null',
      'hooks/__tests__/some-behaviour.test.ts': "import { helper } from '@/lib/missing'",
    })
    const { subjects, unresolved } = collectTestSubjects(root)
    expect(subjects).toEqual([])
    expect(unresolved).toEqual(['hooks/__tests__/some-behaviour.test.ts'])
  })
})

describe('collectTestSubjects — a suite nested deeper inside __tests__', () => {
  it('resolves to nothing BY IMPORT — containment refuses everything it can reach', () => {
    // `ownerOf`'s second arm, and the reason it is not dead code on web (#84
    // supposed it was, and that reaching it would mean exporting the helper for
    // a test alone). A file under `__tests__/nested/` is still matched by
    // `**/__tests__/**/*.test.{ts,tsx}`, so vitest WOULD run it — but its parent
    // is not named `__tests__`, so the owner becomes `hooks/__tests__/nested`.
    //
    // On the IMPORT path that owner can never be satisfied: every module under
    // it is also under `__tests__`, which `subjectsByImport` refuses outright,
    // so the suite's real subject one level up is out of reach. It lands in
    // `unresolved`, where the gate's partition forces somebody to classify it —
    // a safe failure. The case below shows the by-NAME path reaching a
    // different answer, which is why neither is endorsed as right here rather
    // than fixed inside a function #77 holds byte-identical with mobile's.
    const root = tree({
      'hooks/useFoo.ts': 'export const useFoo = () => null',
      'hooks/__tests__/nested/useFoo.test.ts': "import { useFoo } from '../../useFoo'",
    })
    const { subjects, testFiles, unresolved } = collectTestSubjects(root)
    expect(testFiles).toEqual(['hooks/__tests__/nested/useFoo.test.ts'])
    expect(subjects).toEqual([])
    expect(unresolved).toEqual(['hooks/__tests__/nested/useFoo.test.ts'])
  })

  it('resolves a nested suite BY NAME, to a subject the gate can never instrument', () => {
    // The case that actually pins `ownerOf`'s second arm rather than merely
    // executing it. The case above reaches the arm but does not DISCRIMINATE
    // it: an `ownerOf` that always stripped one level would answer
    // `hooks/__tests__` there, containment would refuse the import either way,
    // and the suite would land in `unresolved` under both. Measured — that
    // mutant survived until this case existed.
    //
    // By NAME is where the two answers part. The real owner is
    // `hooks/__tests__/nested`, so the lookup finds the sibling module; the
    // always-strip version looks in `hooks/__tests__` and finds nothing.
    //
    // Note WHAT it resolves to, which is the sharp edge worth recording: the
    // subject sits inside `__tests__`, so `coverage.exclude` drops it and it is
    // absent from `sourceFiles` — a subject that cannot be instrumented. The
    // gate does not paper over that; `sees every module the suite exercises`
    // would fail on it as unregistered, which is a loud, safe failure rather
    // than a silent mismeasurement.
    const root = tree({
      'hooks/__tests__/nested/useFoo.ts': 'export const useFoo = () => null',
      'hooks/__tests__/nested/useFoo.test.ts': "import { useFoo } from './useFoo'",
    })
    const { subjects, sourceFiles, unresolved } = collectTestSubjects(root)
    expect(subjects).toEqual(['hooks/__tests__/nested/useFoo.ts'])
    expect(unresolved).toEqual([])
    expect(sourceFiles).toEqual([])
  })
})
