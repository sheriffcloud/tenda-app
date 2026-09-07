/**
 * app.config.ts — the half of the APP_ENV guard that is not in lib/env.ts.
 *
 * `getEnv()` exists to tell "nobody set APP_ENV" apart from "somebody chose
 * development", because the first means a production binary is silently
 * talking to the dev API. It can only do that if the value reaches it intact.
 *
 * This file used to write `APP_ENV: process.env.APP_ENV ?? 'development'`,
 * which collapsed both cases into one string before the guard ever ran. With
 * the early return #128 added to getEnv, that default would have made the
 * missing-APP_ENV case SILENT — turning the guard off for the exact failure it
 * was written to catch. It was caught in review, one step before it shipped.
 *
 * So the coupling is asserted rather than left to a comment: a comment saying
 * "do not re-add the default" is exactly what a future edit does not read.
 */
import appConfig from '../app.config'
import type { ConfigContext } from 'expo/config'

/**
 * @expo/config hands the STATIC app.json in as `config`. Only the fields
 * app.config.ts spreads back out matter here, and the guard under test touches
 * none of them.
 */
const context = { config: {} } as unknown as ConfigContext

describe('app.config APP_ENV', () => {
  const original = process.env.APP_ENV

  afterEach(() => {
    if (original === undefined) delete process.env.APP_ENV
    else process.env.APP_ENV = original
  })

  it('leaves APP_ENV UNDEFINED when the build sets nothing', () => {
    // The whole point. If this ever reads 'development', lib/env.ts can no
    // longer tell an unconfigured production build from a deliberate one, and
    // its "APP_ENV is not set in this build" branch becomes unreachable.
    delete process.env.APP_ENV

    expect(appConfig(context).extra?.APP_ENV).toBeUndefined()
  })

  it('passes a real APP_ENV through untouched', () => {
    // The counterweight: "always undefined" would satisfy the case above and
    // break every staging and production build.
    for (const value of ['staging', 'production', 'development']) {
      process.env.APP_ENV = value
      expect(appConfig(context).extra?.APP_ENV).toBe(value)
    }
  })
})
