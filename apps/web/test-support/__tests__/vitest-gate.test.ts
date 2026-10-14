/**
 * @vitest-environment node
 *
 * `declaredRoots` reports WHICH field declares a root (#85).
 *
 * The guard in `coverage-gate.test.ts` asserts this answers `{}` against the
 * real config, and mutation proved it fires — but only by editing the real
 * config, which is a slow and destructive way to check a pure function. These
 * cases check the reporting itself, and in doing so reach the "a root IS
 * declared" arms, which are unreachable through the real config while none is
 * declared.
 *
 * NODE environment, like its siblings: this touches config objects, not a DOM.
 */
import { describe, expect, it } from 'vitest'
import { declaredRoots } from '../vitest-gate'

describe('declaredRoots', () => {
  it('answers empty for a config that declares no root — the shipped state', () => {
    // toStrictEqual, not toEqual, and that is the whole case. Dropping the
    // `!== undefined` guards would make this answer `{ root: undefined }`, which
    // `toEqual` treats as equal to `{}` (measured) — so the register would look
    // empty while carrying a key, and the gate's guard would pass on a config
    // that HAD declared a root. toStrictEqual is what notices.
    expect(declaredRoots({})).toStrictEqual({})
    // A `test` block with no root of its own is the shape this config has.
    expect(declaredRoots({ test: {} })).toStrictEqual({})
  })

  it('names the top-level field, and reports the value it found', () => {
    // The VALUE matters as much as the key: a failure that says only "a root is
    // declared" sends the reader looking for it, and the point of the map is
    // that the failure message hands it over.
    expect(declaredRoots({ root: './app' })).toStrictEqual({ root: './app' })
  })

  it('names test.root separately — the two are different fields', () => {
    expect(declaredRoots({ test: { root: '../..' } })).toStrictEqual({ 'test.root': '../..' })
  })

  it('reports BOTH when both are declared, rather than stopping at the first', () => {
    // Stopping early would under-report: someone fixing the field the message
    // named would re-run and find the guard still failing, with no clue that a
    // second one existed.
    expect(declaredRoots({ root: '.', test: { root: './app' } })).toStrictEqual({
      root: '.',
      'test.root': './app',
    })
  })
})
