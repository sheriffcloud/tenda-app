import Constants from 'expo-constants'
import type { AppEnv } from '@tenda/shared'

/** What to do about it, appended to either complaint below. */
const REMEDY = 'Ensure the EAS build profile sets APP_ENV=staging or APP_ENV=production.'

/**
 * Name the offending value without trusting it to stringify.
 *
 * `Constants.expoConfig?.extra?.APP_ENV` comes out of app config as whatever
 * was put there — this is the one place the type genuinely is unknown, which is
 * why `unknown` appears here and nowhere else in the module. A malformed config
 * can hand us a number, an object, or a Symbol, and `String(aSymbol)` THROWS.
 * An env guard that crashes the app it was added to protect would be a poor
 * trade, so a non-string is described by its type rather than printed.
 */
function describeValue(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : `of type ${typeof value}`
}

/**
 * The build's target environment.
 *
 * WHAT THE GUARD IS FOR: a production binary with no APP_ENV silently points
 * every request at the dev server, and the only symptom is data that looks
 * wrong later. So it complains loudly enough to reach a crash report.
 *
 * WHAT IT IS NOT FOR (#128, the twin of web's #127): calling a value that IS
 * set "not set". The early return covered only staging and production, so an
 * APP_ENV set explicitly to `development` — an ordinary QA or internal build
 * that deliberately targets the dev API — fell through and reported itself
 * missing. Web's copy of this guard had the same conflation and shipped a false
 * console.error in every e2e build; here the cost was a crash report naming the
 * wrong cause, which is quieter and just as misleading.
 *
 * UNLIKE WEB, nothing here is inlined at build time, so both branches below
 * ship in every binary — this is a runtime read of app config, not a compile
 * -time constant that can be tree-shaken away.
 *
 * THIS GUARD IS COUPLED TO app.config.ts AND CANNOT WORK ALONE. That file used
 * to write `APP_ENV: process.env.APP_ENV ?? 'development'`, which collapsed
 * "nobody set it" and "somebody chose development" into one value before this
 * function ever ran. With the early return below, that default would have made
 * the missing-APP_ENV case silent — the exact failure this module exists to
 * report. #128 removed the default; if it ever comes back, the case below that
 * complains about an absent value becomes unreachable and this guard is
 * decorative.
 */
export function getEnv(): AppEnv {
  const env = Constants.expoConfig?.extra?.APP_ENV
  if (env === 'staging' || env === 'production') return env
  // Set, understood, and deliberate — return it as quietly as the two above.
  if (env === 'development') return 'development'

  // What is left is genuinely wrong, in one of two ways that deserve different
  // sentences: a build with NOTHING set is a different mistake from a build
  // with a typo in it, and whoever reads the crash report should not have to
  // guess which. Only in a real binary — in dev the fallback is the answer.
  if (!__DEV__) {
    console.error(
      env === undefined || env === null || env === ''
        ? `[env] APP_ENV is not set in this build, falling back to "development". ${REMEDY}`
        : `[env] APP_ENV is ${describeValue(env)}, which is not an environment this app ` +
          `knows, falling back to "development". ${REMEDY}`,
    )
  }
  return 'development'
}
