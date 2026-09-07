/**
 * lib/env — APP_ENV → AppEnv, and WHEN the guard is allowed to complain.
 *
 * The dangerous case is a production binary with no APP_ENV: it falls back to
 * 'development' and points every request at the dev server, which looks like
 * nothing at all until the data is wrong. So it must complain loudly enough to
 * land in a crash report.
 *
 * THE BUG THIS FILE WAS WRITTEN FOR (#128, the twin of web's #127): the early
 * return covered only staging and production, so an APP_ENV set EXPLICITLY to
 * `development` — an ordinary QA build aimed at the dev API — fell through and
 * reported itself "not set". A crash report naming the wrong cause is worse
 * than none, because it sends whoever reads it to check a setting that is
 * already correct.
 *
 * The module had NO tests before this file, which is how the conflation
 * survived being ported to web and living there just as long.
 *
 * `mock`-prefixed so the jest.mock factory may close over it — the same
 * pattern as app-version.test.ts beside this file.
 */
import { getEnv } from '@/lib/env'

let mockAppEnv: unknown

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { APP_ENV: mockAppEnv } }
    },
  },
}))

/** `__DEV__` is a global the RN runtime defines; a real binary has it false. */
declare const global: { __DEV__: boolean }

function inRealBinary(value: unknown): jest.SpyInstance {
  mockAppEnv = value
  global.__DEV__ = false
  return jest.spyOn(console, 'error').mockImplementation(() => {})
}

afterEach(() => {
  jest.restoreAllMocks()
  global.__DEV__ = true
})

describe('getEnv', () => {
  it('returns the environment when it is one the app knows', () => {
    for (const value of ['staging', 'production'] as const) {
      mockAppEnv = value
      expect(getEnv()).toBe(value)
    }
  })

  it('is SILENT when a real binary sets development ON PURPOSE', () => {
    // #128. Before the fix this printed "APP_ENV is not set in this build" for
    // a value that was set, to one the app understands. Mutation check for
    // whoever edits next: delete the `env === 'development'` early return in
    // lib/env.ts and only THIS case fails.
    const error = inRealBinary('development')

    expect(getEnv()).toBe('development')

    expect(error).not.toHaveBeenCalled()
  })

  it('still complains when a real binary sets NOTHING', () => {
    // The counterweight. Without it the case above is satisfied by deleting the
    // guard outright, which would restore the silent-dev-API bug the module
    // exists to prevent.
    const error = inRealBinary(undefined)

    expect(getEnv()).toBe('development')

    expect(error).toHaveBeenCalledWith(expect.stringContaining('is not set in this build'))
  })

  it('complains DIFFERENTLY about a value it does not recognise', () => {
    // 'qa' IS set, so "is not set" would be the same lie #128 removed — it
    // would tell someone with a typo to set a variable they already set.
    const error = inRealBinary('qa')

    expect(getEnv()).toBe('development')

    expect(error).toHaveBeenCalledWith(expect.stringContaining('is "qa"'))
    expect(error).not.toHaveBeenCalledWith(expect.stringContaining('is not set'))
  })

  it('describes a NON-STRING by its type instead of stringifying it', () => {
    // App config is JSON-ish and can hand us anything. A Symbol is the case
    // that matters: `String(aSymbol)` THROWS, so a guard that interpolated the
    // raw value would crash the binary it was added to protect — at startup,
    // in exactly the misconfigured build that most needs to boot far enough to
    // report itself.
    const error = inRealBinary(Symbol('nope'))

    expect(getEnv()).toBe('development')

    expect(error).toHaveBeenCalledWith(expect.stringContaining('of type symbol'))
  })

  it('stays quiet in a development build, whatever APP_ENV says', () => {
    // __DEV__ true: falling back to development IS the answer, so there is
    // nothing to report. Asserted with a BAD value, because a guard gated on
    // the wrong condition would still be silent for a good one.
    mockAppEnv = 'qa'
    global.__DEV__ = true
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})

    expect(getEnv()).toBe('development')

    expect(error).not.toHaveBeenCalled()
  })
})
