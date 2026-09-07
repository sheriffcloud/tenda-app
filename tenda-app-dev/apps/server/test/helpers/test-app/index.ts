/**
 * HTTP integration harness (CO2): a real Fastify app — real db/auth/queue
 * plugins, real autoloaded routes, the production error envelope — with
 * ONE substitution: a fake chain registry, so no test ever depends on
 * devnet RPC.
 *
 * The barrel every suite imports as `helpers/test-app`. It was a single
 * 511-line module until #44 split it along the seams below; the import path
 * is unchanged, so no suite needed editing.
 *
 *   env.ts         process.env stubs + TEST_DB_CONFIGURED
 *   fake-chain.ts  the fake registry, its adapters and their sentinels
 *   app.ts         boot, suite lock, resetDb, seeding, platform config
 *   rows.ts        DB-backed row builders + authHeader
 *
 * `./env` is imported FIRST and for its side effects, so the stubs are applied
 * before anything below is evaluated. Each sibling imports it too, so entering
 * through a submodule rather than this barrel still gets stubbed env — which
 * matters for `fake-chain.ts`, the one module that reads process.env at module
 * init (see env.ts for the measurement).
 */
import './env'

export { TEST_DB_CONFIGURED } from './env'

// The leased test-database pool (#49): the URL derivation is asserted by
// test/unit/test-db-slot.test.ts, which reaches it through this barrel like
// every other suite reaches the rest of the harness.
export { slotUrl, SLOT_COUNT } from './slot'

export {
  FAKE_BAD_SIGNATURE,
  FAKE_DISPUTE_AUTHORITY,
  FAKE_EVM_ESCROW,
  FAKE_SOLANA_PROGRAM,
  FAKE_UNSIGNED,
  capturedBuilds,
  capturedRelays,
  FAKE_RELAYER_ADDRESS,
  FAKE_RELAYED_TX_REF,
  TEST_ASSET,
  TEST_ASSET_ALT,
  TEST_CHAIN_ID,
  TEST_CHAIN_ID_ALT,
  TEST_NATIVE_ASSET,
  UNREGISTERED_CHAIN_ID,
} from './fake-chain'

export {
  buildTestApp,
  resetDb,
  seedAltChain,
  setPlatformConfig,
  useSuiteLock,
  useTestApp,
} from './app'

export {
  ABSENT_UUID,
  attachExchangeDetails,
  attachGigDetails,
  authHeader,
  createAdmin,
  createBankAccount,
  createEscrow,
  createTransactableUser,
  createUser,
  makeTransactable,
  testWalletAddress,
  type GigDetailsOverrides,
  type TestUser,
} from './rows'
