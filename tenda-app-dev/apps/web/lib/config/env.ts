import type { AppEnv } from '@tenda/shared'

/**
 * Web replacement for apps/mobile/lib/env.ts (expo-constants → NEXT_PUBLIC_*).
 * Same module path on purpose: api/request.ts imports '@/lib/config/env' unchanged.
 *
 * NEXT_PUBLIC_APP_ENV is inlined at build time, so it is identical on the
 * server and in the browser — a server component and the hydrated client
 * always target the same API host.
 */
/** What to do about it, appended to either complaint below. */
const REMEDY =
  'Set NEXT_PUBLIC_APP_ENV=staging or NEXT_PUBLIC_APP_ENV=production in the build environment.'

export function getEnv(): AppEnv {
  const env = process.env.NEXT_PUBLIC_APP_ENV
  if (env === 'staging' || env === 'production') return env
  // 'development' RETURNS HERE TOO, silently. It is a real value, deliberately
  // set — the e2e suite builds in production mode against the stub API and
  // passes exactly this — and the guard below used to call it "not set",
  // printing a console.error that was simply false. That false error is what
  // #127 fixed; it had been failing public-discovery.spec.ts's
  // hydrates-with-no-console-errors assertion intermittently since #27, because
  // whether it lands inside a given test's capture window depends on which page
  // a worker loads first.
  if (env === 'development') return 'development'

  // What is left is genuinely wrong, and the two ways it can be wrong deserve
  // different sentences — a build with NOTHING set is a different mistake from
  // a build with a typo in it, and an operator reading the console should not
  // have to guess which one they made. Both only fire in a production build:
  // outside one, falling back to development is the correct, quiet answer.
  if (process.env.NODE_ENV === 'production') {
    console.error(
      env === undefined || env === ''
        ? `[env] NEXT_PUBLIC_APP_ENV is not set in this build, falling back to "development". ${REMEDY}`
        : `[env] NEXT_PUBLIC_APP_ENV is "${env}", which is not an environment this app knows, ` +
          `falling back to "development". ${REMEDY}`,
    )
  }
  return 'development'
}
