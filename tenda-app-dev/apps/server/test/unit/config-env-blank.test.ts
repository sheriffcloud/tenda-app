/**
 * "A blank optional var reads exactly like an unset one" — the oracle, split
 * out of config-env.test.ts when that file passed the 300-line ceiling, the way
 * secrets-relayer.test.ts was split off secrets.test.ts. Same fixture: the
 * minimal required env, with the optional vars cleared.
 *
 * It matters because the opposite reading is the #34 defect: a var that LOOKS
 * unset but reads as configured silently disables the dev fallback behind it.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { loadConfig, REQUIRED_ENV_VARS } from '@server/config'
import { slackEnvKey } from '@server/lib/slack'

const REQUIRED: Record<string, string> = {
  DATABASE_URL: 'postgres://localhost/test',
  JWT_SECRET: 'secret',
  CLOUDINARY_CLOUD_NAME: 'test-cloud',
  CLOUDINARY_API_KEY: 'test-key',
  CLOUDINARY_API_SECRET: 'test-secret',
  API_BASE_URL: 'https://api.tenda.test',
}

/** Vars under test — cleared each time so a real .env can't colour a result. */
const OPTIONAL = [
  'ADMIN_DASHBOARD_URL',
  slackEnvKey('disputes'),
  'CORS_ORIGIN',
  'GOOGLE_OAUTH_CLIENT_IDS',
  'OPENROUTER_MODERATION_MODEL',
  'OPENROUTER_MODERATION_TIMEOUT_MS',
  'OPENROUTER_MODERATION_MAX_OUTPUT_TOKENS',
]

beforeEach(() => {
  for (const [key, value] of Object.entries(REQUIRED)) process.env[key] = value
  for (const key of OPTIONAL) delete process.env[key]
})

/**
 * A BLANK var must read exactly like an UNSET one (#34) — the rule, and the
 * oracle the two tests below share.
 *
 * `lib/env.ts` states the rule — "blank means absent … one rule, one home" —
 * and `optionalEnv` implements it, but config.ts only routed SOME vars through
 * it; the rest read `process.env.X ?? null`, and `??` does not fire for ''.
 * The consequence is the opposite of harmless: blanking a key is the documented
 * way to switch a provider off, so `TERMII_API_KEY=` built a live Termii sender
 * from an empty credential instead of falling back to the console logger.
 *
 * ORACLE, rather than a hardcoded list of vars: load once with every optional
 * var UNSET, then again with each set to `value`, and require the two configs
 * to agree field by field. A var added later is covered the day it is added,
 * which a hardcoded list would not be. The REQUIRED fixture above needs no such
 * oracle here: a missing required var makes `loadConfig` throw, so both tests in
 * this file fail loudly (config-env.test.ts, which asserts on the throw itself,
 * is the one that needs its explicit drift guard).
 *
 * try/finally is load-bearing, not tidiness: this sets ~25 vars, and a failed
 * assertion that skipped the cleanup would leave them set for every test after
 * it in this file — turning one real failure into a cascade that hides its own
 * cause. `beforeEach` only clears the seven vars in the OPTIONAL fixture.
 */
function assertBlankReadsAsUnset(value: string, label: string): void {
  const required = new Set<string>(REQUIRED_ENV_VARS)
  const optionalKeys = Object.keys(loadConfig()).filter((k) => !required.has(k))
  // The baseline is taken with the optional vars CLEARED, not with whatever the
  // shell happens to hold. Reading it from the ambient environment made this
  // oracle depend on the caller: `beforeEach` clears only the seven vars in the
  // OPTIONAL fixture, so exporting any other optional var — REDIS_URL, which the
  // gate now sets so that seven queue/realtime suites stop skipping — captured a
  // CONFIGURED baseline, and the blank read then differed from it for a reason
  // that is the opposite of the defect this test exists to catch.
  const saved = new Map(optionalKeys.map((key) => [key, process.env[key]]))
  try {
    for (const key of optionalKeys) delete process.env[key]
    const unset = loadConfig()
    for (const key of optionalKeys) process.env[key] = value
    const blank = loadConfig()
    for (const key of optionalKeys) {
      assert.deepStrictEqual(
        blank[key as keyof typeof blank],
        unset[key as keyof typeof unset],
        `${key}: ${label} did not read as unset`,
      )
    }
  } finally {
    // RESTORED, not deleted: the old cleanup stripped every optional var for the
    // rest of the file, so a var the caller had set vanished after this test.
    for (const [key, value_] of saved) {
      if (value_ === undefined) delete process.env[key]
      else process.env[key] = value_
    }
  }
}

test('a whitespace-only optional var reads exactly like an unset one', () => {
  assertBlankReadsAsUnset('   ', 'a whitespace-only value')
})

test('the empty string is treated the same way — it is what an operator actually types', () => {
  // `KEY=` in a .env file yields '', not whitespace. Asserted separately because
  // '' is FALSY and '   ' is truthy, so the two take different code paths
  // through the readers that test truthiness rather than null.
  assertBlankReadsAsUnset('', 'an empty value')
})
