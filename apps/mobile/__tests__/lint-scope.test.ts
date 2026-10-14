/**
 * The lint script must lint the WHOLE app (#153).
 *
 * `expo lint` with no input does not lint this app. Its DEFAULT_INPUTS are
 * `src`, `app` and `components` (@expo/cli/build/src/lint/lintAsync.js), and
 * this project keeps `hooks/`, `wallet/`, `stores/`, `api/`, `features/`,
 * `lib/` and `theme/` at the root — so the script silently covered 451 of 733
 * files, and every warning in those directories was invisible to the gate.
 * That is how a dozen duplicate-import warnings and three unused imports sat
 * in `hooks/` and `wallet/` unnoticed while the tree reported "0 errors".
 *
 * Passing an explicit input is the whole fix, which is exactly the kind of
 * one-character regression nobody notices: reverting it does not fail
 * anything, it just quietly stops looking. Hence this file.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '..')

/** What `expo lint` covers when it is given nothing. Mirrors DEFAULT_INPUTS. */
const EXPO_DEFAULT_INPUTS = ['src', 'app', 'components']

/** Directories holding source this app actually ships, root-relative. */
function sourceDirectories(): string[] {
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .filter((name) => !['node_modules', 'android', 'ios', 'coverage', 'dist', 'assets'].includes(name))
    .filter((name) =>
      fs
        .readdirSync(path.join(ROOT, name), { recursive: true })
        .some((child) => typeof child === 'string' && /\.tsx?$/.test(child)),
    )
}

const lintScript: string = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
).scripts.lint

describe('lint scope', () => {
  it('has something outside expo defaults to protect — otherwise this guard is vacuous', () => {
    // If the app ever moved everything under src/app/components, a bare
    // `expo lint` would be correct and this file should go, not be worked
    // around. So the guard states its own premise rather than assuming it.
    const outside = sourceDirectories().filter((dir) => !EXPO_DEFAULT_INPUTS.includes(dir))
    expect(outside.length).toBeGreaterThan(0)
    expect(outside).toEqual(expect.arrayContaining(['hooks', 'wallet', 'stores']))
  })

  it('passes an explicit input, so the lint covers the whole tree', () => {
    // `expo lint` alone lints the three default directories; anything after it
    // replaces them. The value is asserted, not merely "not bare", because
    // `expo lint hooks` would also be non-bare and still miss most of the app.
    expect(lintScript).toBe('expo lint .')
  })
})
