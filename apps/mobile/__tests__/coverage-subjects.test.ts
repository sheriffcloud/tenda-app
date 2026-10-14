/**
 * The resolver behind coverage-gate.test.ts, on a fixture tree.
 *
 * It is measured against the real app there; here it is measured against
 * inputs the app does not currently contain, because the cases that matter are
 * the ones nobody has written yet — a suite that names a theme, a suite that
 * imports a neighbour it is not testing, a subject one directory down.
 *
 * Every case builds a throwaway tree on disk rather than mocking `fs`: the
 * resolver's whole job is to agree with what is actually there, and a mocked
 * filesystem would let it agree with a fiction instead.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isTestFile } from '@/test-support/jest-test-files'
import { collectTestSubjects } from '@/test-support/coverage-subjects'

const roots: string[] = []

function tree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-subjects-'))
  roots.push(root)
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, relative)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    fs.writeFileSync(absolute, contents)
  }
  return root
}

afterAll(() => {
  roots.forEach((root) => fs.rmSync(root, { recursive: true, force: true }))
})

describe('collectTestSubjects — by name', () => {
  it('resolves a suite named for its module, in either extension', () => {
    const root = tree({
      'hooks/useFoo.ts': 'export const useFoo = () => null',
      'hooks/__tests__/useFoo.test.ts': "import { useFoo } from '../useFoo'",
      'components/Bar.tsx': 'export const Bar = () => null',
      'components/__tests__/Bar.test.tsx': "import { Bar } from '../Bar'",
    })
    expect(collectTestSubjects(root, isTestFile).subjects).toEqual(['components/Bar.tsx', 'hooks/useFoo.ts'])
  })

  it('resolves a suite sitting BESIDE its subject, not in a __tests__ folder', () => {
    // jest's testMatch has two patterns and this is the second one. The first
    // version of the resolver honoured only `**/__tests__/**`, so this layout
    // produced no subject at all and the gate stayed silent about useFoo.ts —
    // measured, and the reason #71 exists.
    const root = tree({
      'hooks/useFoo.ts': 'export const useFoo = () => null',
      'hooks/useFoo.test.ts': "import { useFoo } from './useFoo'",
    })
    expect(collectTestSubjects(root, isTestFile).subjects).toEqual(['hooks/useFoo.ts'])
  })

  it('resolves a spec-suffixed suite, which jest matches as readily as test', () => {
    const root = tree({
      'hooks/useFoo.ts': 'export const useFoo = () => null',
      'hooks/__tests__/useFoo.spec.ts': "import { useFoo } from '../useFoo'",
    })
    expect(collectTestSubjects(root, isTestFile).subjects).toEqual(['hooks/useFoo.ts'])
  })

  it('resolves a split suite through its suffix, one segment at a time', () => {
    // The split halves reach their subject through a harness rather than
    // importing it, the way app/settings/__fixtures__ does — so the NAME is
    // the only signal left. With the subject imported directly the by-import
    // fallback answers correctly too, and the case passes whether suffix
    // stripping works or not. Measured: it survived the mutant that removes it.
    const root = tree({
      'hooks/useFoo.ts': 'export const useFoo = () => null',
      'hooks/__fixtures__/harness.ts': "export { useFoo } from '../useFoo'",
      'hooks/__tests__/useFoo.races.test.ts': "import { useFoo } from '../__fixtures__/harness'",
      'hooks/__tests__/useFoo.cache.slow.test.ts': "import { useFoo } from '../__fixtures__/harness'",
    })
    expect(collectTestSubjects(root, isTestFile).subjects).toEqual(['hooks/useFoo.ts'])
  })

  it('claims nothing for a name that strips to an empty stem', () => {
    // `.foo.test.ts` leaves the stem `.foo`, whose only dot is at index 0.
    // Boundary between "strip again" and "give up", and the input that found
    // the resolver's one uncovered line when its own coverage was measured.
    const root = tree({
      'hooks/useFoo.ts': 'export const useFoo = () => null',
      'hooks/__tests__/.foo.test.ts': "import { useFoo } from '@/lib/missing'",
    })
    const { subjects, unresolved } = collectTestSubjects(root, isTestFile)
    expect(subjects).toEqual([])
    expect(unresolved).toEqual(['hooks/__tests__/.foo.test.ts'])
  })

  it('does NOT count the neighbours a named suite renders', () => {
    // The by-import signal, applied to a suite that already resolved by name,
    // relabels every shared component its subject renders. Measured on the
    // real tree: Button, Text, Chip and SectionLabel all became "subjects" of
    // the ui suites. A collaborator is not a subject.
    const root = tree({
      'ui/Chip.tsx': 'export const Chip = () => null',
      'ui/Button.tsx': 'export const Button = () => null',
      'ui/__tests__/Chip.test.tsx': "import { Chip } from '../Chip'\nimport { Button } from '../Button'",
    })
    expect(collectTestSubjects(root, isTestFile).subjects).toEqual(['ui/Chip.tsx'])
  })
})

describe('collectTestSubjects — by import, for suites named after a theme', () => {
  it('resolves through the tsconfig alias and through a relative specifier', () => {
    const root = tree({
      'stores/realtime.store.ts': 'export const store = {}',
      'stores/chat.store.ts': 'export const chat = {}',
      'stores/__tests__/mirror.test.ts':
        "jest.mock('@/lib/ws')\nimport { store } from '@/stores/realtime.store'\nimport { chat } from '../chat.store'",
      'lib/ws.ts': 'export const ws = {}',
    })
    expect(collectTestSubjects(root, isTestFile).subjects).toEqual([
      'stores/chat.store.ts',
      'stores/realtime.store.ts',
    ])
  })

  it('reaches a subject one directory below the owner', () => {
    const root = tree({
      'app/wallet/intents/[id].tsx': 'export default () => null',
      'app/wallet/__tests__/intent.test.tsx': "import Screen from '../intents/[id]'",
    })
    expect(collectTestSubjects(root, isTestFile).subjects).toEqual(['app/wallet/intents/[id].tsx'])
  })

  it('resolves a directory specifier to its index barrel', () => {
    const root = tree({
      'api/client/index.ts': 'export const api = {}',
      'api/client/__tests__/wiring.test.ts': "import { api } from '@/api/client'",
    })
    expect(collectTestSubjects(root, isTestFile).subjects).toEqual(['api/client/index.ts'])
  })

  it('refuses a module OUTSIDE the owning directory — that is a collaborator', () => {
    const root = tree({
      'stores/realtime.store.ts': 'export const store = {}',
      'lib/ws.ts': 'export const ws = {}',
      'stores/__tests__/mirror.test.ts':
        "import { store } from '../realtime.store'\nimport { ws } from '../../lib/ws'",
    })
    expect(collectTestSubjects(root, isTestFile).subjects).toEqual(['stores/realtime.store.ts'])
  })

  it('refuses a bare specifier even when it collides with a real path', () => {
    // `'stores/seed'` is a PACKAGE specifier — the app's own modules are
    // reached through `@/` or a relative path, never bare. It is spelled here
    // to collide with a real file inside the owning directory, because a
    // fixture with nothing to collide with lets this case pass whether the
    // rule is enforced or not. Measured: without the collision the mutant
    // that drops the rule survives.
    const root = tree({
      'stores/seed.ts': 'export const seed = () => null',
      'stores/realtime.store.ts': 'export const store = {}',
      'stores/__tests__/mirror.test.ts':
        "import { seed } from 'stores/seed'\nimport { store } from '../realtime.store'",
    })
    expect(collectTestSubjects(root, isTestFile).subjects).toEqual(['stores/realtime.store.ts'])
  })

  it('never counts another suite as a subject', () => {
    const root = tree({
      'stores/__tests__/helpers.ts': 'export const seed = () => null',
      'stores/__tests__/mirror.test.ts': "import { seed } from './helpers'",
    })
    const { subjects, unresolved } = collectTestSubjects(root, isTestFile)
    expect(subjects).toEqual([])
    expect(unresolved).toEqual(['stores/__tests__/mirror.test.ts'])
  })
})

describe('collectTestSubjects — what it reports as unresolved', () => {
  it('claims no subject for a suite at the app root', () => {
    // A root suite owns no module directory, so the containment check refuses
    // everything it imports: the owner is '.', the prefix is './', and no
    // root-relative key starts that way. Without that the harness suites,
    // which reach for the config and half the app, would claim all of it.
    const root = tree({
      'jest.config.js': 'module.exports = {}',
      'app/index.tsx': 'export default () => null',
      '__tests__/harness.test.ts': "import config from '../jest.config'\nimport App from '@/app/index'",
    })
    const { subjects, unresolved } = collectTestSubjects(root, isTestFile)
    expect(subjects).toEqual([])
    expect(unresolved).toEqual(['__tests__/harness.test.ts'])
  })

  it('claims no subject rather than guessing when nothing resolves', () => {
    const root = tree({
      'hooks/useFoo.ts': 'export const useFoo = () => null',
      'hooks/__tests__/some-behaviour.test.ts': "import { helper } from '@/lib/missing'",
    })
    const { subjects, unresolved } = collectTestSubjects(root, isTestFile)
    expect(subjects).toEqual([])
    expect(unresolved).toEqual(['hooks/__tests__/some-behaviour.test.ts'])
  })
})

describe('collectTestSubjects — what it walks', () => {
  it('skips dependencies and build output, so a vendored suite is not a subject', () => {
    const root = tree({
      'hooks/useFoo.ts': 'export const useFoo = () => null',
      'hooks/__tests__/useFoo.test.ts': "import { useFoo } from '../useFoo'",
      'node_modules/pkg/thing.ts': 'export const thing = {}',
      'node_modules/pkg/__tests__/thing.test.ts': "import { thing } from '../thing'",
      'coverage/lcov-report/x.ts': 'export const x = {}',
      'coverage/lcov-report/__tests__/x.test.ts': "import { x } from '../x'",
      'android/app/Foo.ts': 'export const foo = {}',
      'android/app/__tests__/Foo.test.ts': "import { foo } from '../Foo'",
    })
    const { subjects, testFiles } = collectTestSubjects(root, isTestFile)
    expect(subjects).toEqual(['hooks/useFoo.ts'])
    expect(testFiles).toEqual(['hooks/__tests__/useFoo.test.ts'])
  })

  it('reports the source files a coverage pattern could match, and no suites', () => {
    const root = tree({
      'hooks/useFoo.ts': 'export const useFoo = () => null',
      'components/Bar.tsx': 'export const Bar = () => null',
      'hooks/__tests__/useFoo.test.ts': "import { useFoo } from '../useFoo'",
      'hooks/__tests__/seed.ts': 'export const seed = () => null',
      'hooks/__fixtures__/harness.ts': 'export const harness = {}',
      'assets/logo.png': 'binary',
      'node_modules/pkg/thing.ts': 'export const thing = {}',
    })
    // Out: the suite, and the helper BESIDE it — jest's testMatch covers the
    // whole `__tests__` directory, so neither can ever be instrumented. Also
    // out, and this REVERSES what #58 first asserted here: the `__fixtures__`
    // module. It was listed as "ordinary code a pattern could name", which is
    // true of its syntax and wrong about its job — the case below has the harm
    // that reading did. Gone entirely: the asset and the dependency.
    expect(collectTestSubjects(root, isTestFile).sourceFiles).toEqual([
      'components/Bar.tsx',
      'hooks/useFoo.ts',
    ])
  })

  it('treats __fixtures__ and __mocks__ as test support — not source, not a subject', () => {
    // Measured harm, not a preference (#65): `account-switch.test.ts` is
    // theme-named, so it resolves by IMPORT, and it imports the chat fixture
    // its two sibling suites share. Under the old reading that fixture became
    // a subject, and the gate then failed demanding a file of test DATA be
    // instrumented — which would measure the harness and inflate the figure
    // the gate reports.
    const root = tree({
      'stores/chat.store.ts': 'export const useChatStore = {}',
      'stores/__fixtures__/chat.ts': 'export const conversation = () => ({})',
      'stores/__mocks__/secure-store.ts': 'export const getJwtToken = () => null',
      'stores/__tests__/account-switch.test.ts':
        "import { useChatStore } from '../chat.store'\n" +
        "import { conversation } from '../__fixtures__/chat'\n" +
        "import { getJwtToken } from '../__mocks__/secure-store'",
    })
    const { subjects, sourceFiles } = collectTestSubjects(root, isTestFile)
    // The store it genuinely tests, and only that.
    expect(subjects).toEqual(['stores/chat.store.ts'])
    // Neither support module is offered as gateable source either, so the gate
    // cannot demand coverage of them by another route.
    expect(sourceFiles).toEqual(['stores/chat.store.ts'])
  })

  it('never offers a suite as gateable source, in either layout', () => {
    // A test file is not coverable code. Missing that, a scope pattern that
    // matched only test files would look alive to the inert-pattern check.
    const root = tree({
      'hooks/useFoo.ts': 'export const useFoo = () => null',
      'hooks/useFoo.test.ts': "import { useFoo } from './useFoo'",
      'hooks/__tests__/useFoo.races.test.ts': "import { useFoo } from '../useFoo'",
    })
    expect(collectTestSubjects(root, isTestFile).sourceFiles).toEqual(['hooks/useFoo.ts'])
  })

  it('counts only suite files as suites, not every file under __tests__', () => {
    const root = tree({
      'hooks/useFoo.ts': 'export const useFoo = () => null',
      'hooks/__tests__/useFoo.test.ts': "import { useFoo } from '../useFoo'",
      'hooks/__tests__/fixtures.json': '{}',
      'hooks/__tests__/README.md': 'notes',
    })
    expect(collectTestSubjects(root, isTestFile).testFiles).toEqual(['hooks/__tests__/useFoo.test.ts'])
  })
})
