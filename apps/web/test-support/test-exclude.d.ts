/**
 * The slice of `test-exclude` this app uses, declared locally.
 *
 * The package ships no types. `@types/test-exclude` exists but only at 6.0.2
 * against the 7.0.2 runtime `@vitest/coverage-v8` pulls in — a version claim
 * that cannot be checked cheaply, and a wrong one here would type a matcher
 * whose answers the coverage gate depends on. Declared instead: two members,
 * both exercised against the real package before this file was written
 * (absolute paths required; escaped brackets gate, unescaped do not).
 *
 * Deliberately NOT a full transcription of the package's surface — everything
 * declared here is called by test-support/vitest-gate.ts, so an unused member
 * cannot rot unnoticed.
 */
declare module 'test-exclude' {
  interface TestExcludeOptions {
    cwd?: string
    include?: readonly string[]
    exclude?: readonly string[]
  }

  export default class TestExclude {
    constructor(options?: TestExcludeOptions)
    /** True when the coverage provider would instrument this ABSOLUTE path. */
    shouldInstrument(filename: string): boolean
  }
}
