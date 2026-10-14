/**
 * Environment stubs for the HTTP integration harness.
 *
 * ITS OWN MODULE so the ordering is stated rather than implied. When this lived
 * at the top of a single 511-line test-app.ts it worked because the stubs
 * happened to precede the imports below them; split across files that would
 * have become a trap, so every sibling imports `./env` and the barrel imports
 * it before anything else.
 *
 * WHERE THAT ORDERING ACTUALLY BITES, measured rather than assumed (#44):
 * `fake-chain.ts` reads process.env at MODULE INIT (FAKE_SOLANA_PROGRAM), and
 * without its own `import './env'` that constant resolves to `''` instead of
 * the program id. Nothing else does: `app.ts` reads env only inside functions,
 * `rows.ts` not at all, and `config.ts` reads lazily. The other imports are
 * therefore cheap insurance against a future eager read, not load-bearing.
 *
 * Every assignment is idempotent (`??=`, or a re-derivation of the same value),
 * so importing this from several modules in one process is safe and the entry
 * point does not have to be the barrel.
 *
 * GATED on TEST_DATABASE_URL (a dedicated database, e.g. tenda_test):
 *
 *   TEST_DATABASE_URL=postgresql://...:5432/tenda_test pnpm test
 */

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://unused/test'
process.env.JWT_SECRET ??= 'test-secret'
process.env.CLOUDINARY_CLOUD_NAME ??= 'test-cloud'
process.env.CLOUDINARY_API_KEY ??= 'test-key'
process.env.CLOUDINARY_API_SECRET ??= 'test-secret-cl'
process.env.SOLANA_RPC_URL ??= 'http://127.0.0.1:8899'
process.env.SOLANA_TREASURY_ADDRESS ??= '4Nd1mYvK4Pm1x2HCmzCx5GQDV9KbpMK128bxgL5dVDU1'
process.env.SOLANA_PROGRAM_ID ??= '7H6AAoghUCPAVA1WTEwpSmkiRfPHWrgFidZQPzbXzkes'
process.env.API_BASE_URL ??= 'https://api.tenda.test'
delete process.env.REDIS_URL // queue stays the 501 stub — no Redis dependency

/** Whether a dedicated test database was supplied. Pair with `{ skip: ... }`. */
export const TEST_DB_CONFIGURED = process.env.TEST_DATABASE_URL !== undefined
