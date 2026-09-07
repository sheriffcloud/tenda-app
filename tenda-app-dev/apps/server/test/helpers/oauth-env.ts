/**
 * Configure a Google OAuth audience BEFORE anything reads config (#109).
 *
 * ITS OWN MODULE for the same reason `test-app/env.ts` is: ordering. `getConfig()`
 * caches on its first call, and `buildAuthStrategies`'s OAuth strategies live in
 * a module-level memo built on first use — so neither can be influenced once the
 * app has booted. A test file that imports THIS first gets a google strategy in
 * the registry, with no reset seam added to production code.
 *
 * MEASURED, which is why no seam was added: `getConfig()` is lazy (it reads
 * process.env inside `loadConfig`, and nothing in the harness's import chain
 * calls it at module load), and node:test runs each file in its own process, so
 * the assignment below is scoped to whichever file imports it.
 *
 * APPLE IS DELIBERATELY LEFT UNSET. A provider with no audience must stay absent
 * from the registry, and the suite importing this asserts exactly that
 * difference — configuration, not code, is what decides which methods exist.
 */

/** The audience the fake tokens in `auth-oauth-verify.test.ts` are minted for. */
export const GOOGLE_TEST_AUDIENCE = 'tenda-test.apps.googleusercontent.com'

// Assigned, not `??=`: the value has to be known for the audience assertions,
// and a stray GOOGLE_OAUTH_CLIENT_IDS in the developer's environment would
// otherwise decide it.
process.env.GOOGLE_OAUTH_CLIENT_IDS = GOOGLE_TEST_AUDIENCE
