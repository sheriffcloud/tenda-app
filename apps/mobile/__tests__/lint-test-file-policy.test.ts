/**
 * @jest-environment node
 *
 * Two lint rules are OFF for test files and ON for source (eslint.config.js).
 *
 * They were 555 of the 591 warnings the tree carried, every one of them the
 * deliberate mock-before-import pattern, which drowned the handful that were
 * real. The config now says why. What nothing says is WHERE the override stops,
 * and an override written as a glob is exactly the kind of thing that widens by
 * accident: change `**` into a pattern that also matches `lib/` and the rules
 * go quiet across the app with the gate still green. So this lints real snippets
 * through the same config and holds both halves.
 */
import path from 'node:path'
import { ESLint } from 'eslint'

const ROOT = path.join(__dirname, '..')

// The config is plain CommonJS, so it is `require`d and handed to ESLint
// directly: ESLint 9 would otherwise load it with a dynamic import(), which
// jest's sandbox refuses without --experimental-vm-modules. Same config, no
// loader — and `overrideConfigFile: true` stops ESLint looking for another.
const CONFIG = require('../eslint.config.js')

/** A body that breaks both rules: a statement before an import, and a require(). */
const OFFENDER = [
  "import a from 'a'",
  'const first = 1',
  "import b from 'b'",
  "const c = require('c')",
  'export default [a, b, c, first]',
].join('\n')

async function rulesFlagged(relativePath: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: true, overrideConfig: CONFIG })
  const [result] = await eslint.lintText(OFFENDER, { filePath: path.join(ROOT, relativePath) })
  return result.messages.map((m) => m.ruleId ?? 'parse-error').sort()
}

describe('lint policy for test files', () => {
  it('SOURCE still gets both rules', async () => {
    const flagged = await rulesFlagged('lib/__policy-probe.ts')
    expect(flagged).toContain('import/first')
    expect(flagged).toContain('@typescript-eslint/no-require-imports')
  })

  it.each([
    ['a __tests__ directory', 'lib/__tests__/__policy-probe.test.ts'],
    ['a *.test.tsx file beside source', 'components/__policy-probe.test.tsx'],
    ['a __mocks__ directory', 'lib/__mocks__/__policy-probe.ts'],
    ['a __fixtures__ directory', 'stores/__fixtures__/__policy-probe.ts'],
  ])('%s gets neither', async (_label, file) => {
    const flagged = await rulesFlagged(file)
    expect(flagged).not.toContain('import/first')
    expect(flagged).not.toContain('@typescript-eslint/no-require-imports')
  })

  it('probes something real: the offending snippet is flagged for SOMETHING outside the carve-out', async () => {
    // A probe that lints clean everywhere would pass every case above by
    // saying nothing. The same snippet in source must produce messages.
    expect((await rulesFlagged('lib/__policy-probe.ts')).length).toBeGreaterThan(0)
  })
})
