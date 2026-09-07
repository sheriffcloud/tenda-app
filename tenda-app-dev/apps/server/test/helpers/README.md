# test/helpers/

Shared infrastructure for the unit + integration suites (full c8 run:
`TEST_DATABASE_URL=… pnpm test`).

| File | Purpose |
|---|---|
| `test-app/` | The HTTP harness, imported as `helpers/test-app` (barrel — the path is unchanged since #44 split the old 511-line module). `env.ts` process.env stubs, imported first because the order is load-bearing · `fake-chain.ts` the fake registry and its sentinels · `app.ts` `useTestApp()`/`buildTestApp()`, cross-process suite lock, `resetDb()`, `seedAltChain()`, `setPlatformConfig()` · `rows.ts` DB-backed builders (`createUser()`, `createEscrow()`, `makeTransactable()` for the 9D gate, …) + `authHeader()` |
| `escrow-states.ts` | `partiedEscrow()`, `openGig()`, request-body builders shared by the `test/integration/escrows-*` route-matrix suites |
| `fixtures.ts` | `userFixture()`, `walletFixture()`, `escrowFixture()`, … typed object factories |
| `completed-work.ts` | `completedWork()`, `completedStat()`, `workedGig()` — the fixtures and the 200-asserting call the two `completed-work-*` suites share, so the pair cannot build its rows two different ways |
| `solana.ts` | `fakeSolanaRpc()`, escrow/platform account encoders + event-log builders for verify-tx tests |
| `stub-rpc.ts` | `startStubRpc()` — a throwaway JSON-RPC node on a REAL socket, for asserting what the server puts on the wire rather than what a mocked transport was told (EVM listeners, and both relayers' live calls — viem's transport and web3's `Connection`); `withEvmChainEnv()` points one chain's secrets at it and restores them |
| `chains-boot.ts` | `withBootedChainsApp()`, `seedBootChain()`, `withNoChainsConfigured()` — an app carrying the REAL chains plugin, which no route suite has (the harness substitutes a fake registry), plus the no-chain environment its boot refusal needs |
| `agent.ts` | `registerAgent()` (through the real POST /v1/agent/register with a nonce-signed proof on the eip155 harness chain), `agentTaskBody()`, `agentWalletAddress()`, `TaskPost` (the body type the refusal cases post — a widened `category` plus the `permit` the one-shot refuses) — the Agent API v1 suites' fixtures, shared by `agent-tasks` and `agent-tasks-listing` |
| `auth-message.ts` | `issueNonce()` + `buildAuthMessage()` — wallet-auth flow helpers |
| `admin-auth.ts` | `issueAdminCode()` — admin email-OTP login helper |
| `oauth-env.ts` | `GOOGLE_TEST_AUDIENCE` — a side-effect module that configures the Google OAuth audience; **import it first**, since config and the strategy registry both memoise on first use and cannot be influenced afterwards |
| `queue-double.ts` | `queueDouble()`, `notificationsOf()`, `alertsOf()` — the recorder that answers "what got enqueued?", typed as a union over `JobName` so a producer writing to the wrong queue fails to compile |
| `side-effects.ts` | `installCapture()`, `interceptQueue()` — the same question against a LIVE fastify instance, adding the WS seam; between them, everything by which news reaches a user leaves this process |
| `fanout.ts` | `drainSubscriberFanout()` — runs the captured expansion jobs as a worker would, so a "who hears about this gig?" test can cross the queue hop `fanOutEscrowEvent` stops at |
| `republish-event.ts` | `republishEvent()` — the `EscrowRepublishEvent` verify-tx hands the fan-out, built from the WIRE event so `wire_event` and `internal_event` cannot disagree |
| `alert-fixtures.ts` | `disputeRaisedAlert()` — the fat, post-resolver alert a CHANNEL renders, as opposed to the thin `AlertRef` that rides the queue |
| `alert-log.ts` | `alertLogSpy()` — the `AlertLogger` double; records info AND warn, because "warned and did not throw" is what most of the alerts tests actually assert |
| `alert-channel-contract.ts` | `testChannelContract()` — REGISTERS the tests every alert channel must pass, one named test per property, so a failure names which property and which channel |
| `fetch-stub.ts` | `stubFetch()`, `stubFetchRejecting()`, `restoreFetch()`, `stubExpoPush()` — the outbound-HTTP double; returns a REAL `Response`, so no fixture can describe an impossible one like `{ ok: true, status: 500 }` |
| `fiat-intents.ts` | `seedFiatIntent()`, `TEST_FIAT_PROVIDER` — insert one intent in a chosen status. No public route creates an intent in an arbitrary status, and the cases that need one are about the status a read or an override FINDS it in |
| `route-table.ts` | `servedPaths(app)` — every URL the server actually serves, parsed back out of `printRoutes`. Split out of the drift suite in #121; the format is read from find-my-way's own pretty-printer, not guessed from a sample |
| `agent-api-validator.ts` | `strictAjv()`, `agentApiAjv()`, `COMPONENT_REF_PREFIX` — the ONE strict-validator configuration the Agent API suites share (no coercion, no unknown-key stripping), with every component schema registered under its `$ref`; pinned here so a loosened copy cannot quietly weaken one suite |
| `source-scan.ts` | `stripComments()` — for the few invariants only a source read can catch; blanks comment bodies while preserving line numbers, so a scan cannot match the prose ABOUT the pattern it hunts |
| `anvil.ts` | `startAnvilFixture(port)`, `sendUnsigned()`, `signPermit()`, `ANVIL_KEYS`, `ANVIL_CHAIN_ID`, `anvilSkip` — a REAL EVM node with the repo's TendaEscrow + mock USDC deployed and the dev accounts funded, shared by every `*.anvil.test.ts`; each suite picks its own port because files run concurrently |
| `litesvm.ts` | `startLiteSvm()`, `litesvmRpc()`, `litesvmRelayer()`, `litesvmSkip` — the server's Solana read seam and relayer write path over LiteSVM running the REAL `tenda_escrow.so`, so a transaction the server built is proven to execute on the program the chain runs |
| `cursor-store.ts` | `fakeCursorStore()` — in-memory `CursorStore` for the polling-listener suites, recording live, history and adoption writes IN ORDER so a test can assert that live is persisted before history runs, and that adoption is the ONE atomic write it has to be (#35) |
| `redis.ts` / `chain.ts` | Type surfaces only — concrete impls live in the suites that need them |

Every file in this directory has a row, and `test/unit/test-helpers-readme.test.ts`
fails if that stops being true in either direction. That guard exists because the
cost of an incomplete table here is not a stale doc: a reader who cannot find an
existing helper writes a second one, which is the failure this directory exists to
prevent.

The fastify-cli `test/helper.ts` (`build()`) predates these and stays for the
suites that use it; new helpers extend rather than replace it.

## Conventions

- Helpers exist so every test reads "what's being asserted," not "how DB /
  chain mocks are wired."
- Anything touching an external service lives in `test/integration/` and is
  gated on `TEST_DATABASE_URL` (`{ skip }` otherwise). No Redis dependency —
  the harness deletes `REDIS_URL` so the queue stays a 501 stub.
- No `any` / `unknown` casts (project rule); fixtures expose narrow types.
- `useTestApp()` DOES truncate every public table before each test (its
  `beforeEach` calls `resetDb()`, which then re-seeds the chain/asset rows).
  The older fastify-cli `test/helper.ts` `build()` path does not — suites on
  that one must use unique values (e.g. random category names) rather than
  relying on a clean slate. This line used to state the second half as a
  blanket rule, which stopped being true when `useTestApp` landed.

## Importing

Tests use the `@server/*` alias exactly like runtime code — `test/tsconfig.json`
maps it (paths resolve relative to the declaring config, hence `../src/*`):

```ts
import { migrateOnBoot } from '@server/lib/boot-migrate'
```
