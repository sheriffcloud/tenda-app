# test/helpers/

Shared infrastructure for the unit + integration suites (full c8 run:
`TEST_DATABASE_URL=… pnpm test`).

| File | Purpose |
|---|---|
| `test-app/` | The HTTP harness, imported as `helpers/test-app` (barrel — the path is unchanged since #44 split the old 511-line module). `env.ts` process.env stubs, imported first because the order is load-bearing · `fake-chain.ts` the fake registry and its sentinels · `app.ts` `useTestApp()`/`buildTestApp()`, cross-process suite lock, `resetDb()`, `seedAltChain()`, `setPlatformConfig()` · `rows.ts` DB-backed builders (`createUser()`, `createEscrow()`, `makeTransactable()` for the 9D gate, `linkWallet()` / `testEvmAddress()` for the wallet suites — ONE inserter, so `auth-wallets` and `auth-main-wallet` cannot build subtly different wallets for the same scenario, …) + `authHeader()` |
| `escrow-states.ts` | `partiedEscrow()`, `openGig()`, request-body builders shared by the `test/integration/escrows-*` route-matrix suites |
| `fixtures.ts` | `userFixture()`, `walletFixture()`, `escrowFixture()`, … typed object factories |
| `completed-work.ts` | `completedWork()`, `completedStat()`, `workedGig()` — the fixtures and the 200-asserting call the two `completed-work-*` suites share, so the pair cannot build its rows two different ways |
| `solana.ts` | `fakeSolanaRpc()`, escrow/platform account encoders + event-log builders for verify-tx tests |
| `stub-rpc.ts` | `startStubRpc()` — a throwaway JSON-RPC node on a REAL socket, for asserting what the server puts on the wire rather than what a mocked transport was told (EVM listeners, and both relayers' live calls — viem's transport and web3's `Connection`); `withEvmChainEnv()` points one chain's secrets at it and restores them |
| `chains-boot.ts` | `withBootedChainsApp()`, `seedBootChain()`, `withNoChainsConfigured()` — an app carrying the REAL chains plugin, which no route suite has (the harness substitutes a fake registry), plus the no-chain environment its boot refusal needs |
| `agent.ts` | `registerAgent()` (through the real POST /v1/agent/register with a nonce-signed proof on the eip155 harness chain), `agentTaskBody()`, `agentWalletAddress()`, `agentPaymentHeader()`, `signRelayTerms()` (sign 402 terms VERBATIM into the resend envelope — shared by the relay suite and #109's recorder so both sign identically), `TaskPost` (the body type the refusal cases post — a widened `category` plus the `permit` the one-shot refuses) — the Agent API v1 suites' fixtures, shared by `agent-tasks` and `agent-tasks-listing` |
| `x402-recording.ts` | `sameShape()`, `VOLATILE`, `writeRecording()` — comparing the PUBLISHED x402 recording (`packages/api-doc/src/recorded-exchange.ts`, inlined into the Agent API document as #109's examples) against a fresh capture, and re-writing it via `pnpm record:x402`. Shape and stable values are both compared; the fields that differ every run are named one by one in `VOLATILE` rather than skipped by a loose match |
| `agent-demo-env.ts` | `DEMO_ADDRESS`, `DEMO_DRAFT_CAP` — a side-effect module that sets `AGENT_DEMO_ADDRESS` for the demo-session suites (#108) and a draft-ring cap of three (#147) so a case can fill the ring in a handful of posts; **import it first**, since `getConfig()` memoises on first read and imports hoist above statements. The unconfigured case has its own suite because one process cannot hold both answers |
| `auth-message.ts` | `issueNonce()` + `buildAuthMessage()` — wallet-auth flow helpers |
| `admin-auth.ts` | `issueAdminCode()` — admin email-OTP login helper |
| `oauth-env.ts` | `GOOGLE_TEST_AUDIENCE` — a side-effect module that configures the Google OAuth audience; **import it first**, since config and the strategy registry both memoise on first use and cannot be influenced afterwards |
| `settle.ts` | `within()` — bounds a promise so a test that is asserting a TIMEOUT fails instead of hanging the runner when that timeout regresses (#48's lesson, applied to the RPC failover suites) |
| `queue-double.ts` | `queueDouble()`, `notificationsOf()`, `alertsOf()` — the recorder that answers "what got enqueued?", typed as a union over `JobName` so a producer writing to the wrong queue fails to compile |
| `side-effects.ts` | `installCapture()`, `interceptQueue()` — the same question against a LIVE fastify instance, adding the WS seam; between them, everything by which news reaches a user leaves this process |
| `fanout.ts` | `drainSubscriberFanout()` — runs the captured expansion jobs as a worker would, so a "who hears about this gig?" test can cross the queue hop `fanOutEscrowEvent` stops at |
| `republish-event.ts` | `republishEvent()` — the `EscrowRepublishEvent` verify-tx hands the fan-out, built from the WIRE event so `wire_event` and `internal_event` cannot disagree |
| `alert-fixtures.ts` | `disputeRaisedAlert()` — the fat, post-resolver alert a CHANNEL renders, as opposed to the thin `AlertRef` that rides the queue |
| `alert-log.ts` | `alertLogSpy()` — the `AlertLogger` double; records info AND warn, because "warned and did not throw" is what most of the alerts tests actually assert |
| `alert-channel-contract.ts` | `testChannelContract()` — REGISTERS the tests every alert channel must pass, one named test per property, so a failure names which property and which channel |
| `fake-redis-pubsub.ts` | `createFakeRedisHub()` — in-memory Redis pub/sub shared by every client it makes, so a two-instance test ("pod A mutates, pod B sees it") runs without a Redis; `settle()` lets deliveries land |
| `fetch-stub.ts` | `stubFetch()`, `stubFetchRejecting()`, `restoreFetch()`, `stubExpoPush()` — the outbound-HTTP double; returns a REAL `Response`, so no fixture can describe an impossible one like `{ ok: true, status: 500 }` |
| `fiat-intents.ts` | `seedFiatIntent()`, `TEST_FIAT_PROVIDER` — insert one intent in a chosen status. No public route creates an intent in an arbitrary status, and the cases that need one are about the status a read or an override FINDS it in |
| `route-table.ts` | `servedPaths(app)` — every URL the server actually serves, parsed back out of `printRoutes`. Split out of the drift suite in #121; the format is read from find-my-way's own pretty-printer, not guessed from a sample |
| `pause-chain.ts` | `withChainPaused(chain_id, body)` — sets `paused` on a live manifest entry for the length of the body and restores it in `finally`, so a thrown assertion cannot leave a chain paused for every later suite in the process |
| `source-scan.ts` | `stripComments()`, `tsFilesUnder()` — for the few invariants only a source read can catch; blanks comment bodies while preserving line numbers, so a scan cannot match the prose ABOUT the pattern it hunts, and walks a directory once so three guards do not each re-declare a recursive walk that could quietly stop descending |
| `gas-seed-claim.ts` | `makeDeps()`, `MOBILE`, `ZEROG`, `SOLANA` — the claim surface's UNIT fixture: array-backed stores, funders that record whether their balance was actually READ (the two-phase proof), and a queue that can be made to fail or be absent. Shared by the availability and claiming suites, which exercise one `GasSeedClaimDeps` from two directions |
| `slack-message.ts` | `sectionTexts()`, `contextTexts()`, `allText()` — read a `SlackMessage` back as strings. Four suites assert against the same message shape and one had already hand-rolled a character-for-character copy; four copies of "what does this message say" is four chances for one to stop looking at the context block. Read-only and assertion-free on purpose — the suites decide what is true |
| `slack-copy-fixtures.ts` | `disputeAlert()`, `render()`, `raisedByLine()`, `ALERT_FIXTURES`, `NAMES`, `ENV_*`, the party ids — the fixtures the three Slack copy suites share (task #45 split them out of one 522-line file). Ids are module-level so an id and the name it renders as stay paired across suites; `ALERT_FIXTURES` is keyed by `AlertKind` so a new kind breaks the build in ONE place |
| `gas-seed-monitor-db.ts` | `seedMonitorChain()`, `balances()`, `monitorDeps()`, `monitorHarness()`, `monitorChannels()` — the hot-wallet MONITOR's fixtures (#53b): a chain row carrying a seed, a balance reader whose unlisted chains read as unreadable rather than as zero, and a channel pair under the test's control (Slack is unconfigured in every test env, so the registry would enqueue nothing and every queue assertion would pass vacuously) |
| `gas-seed-claim-db.ts` | `withSeedableChain()`, `eligibleUser()`, `deps()`, `evmAddress()` — the same surface against postgres: a seedable 0G row and a user who passes every account-side gate (verified phone + registered device + wallet). One definition of "eligible", so the day a gate is added the other suite cannot keep passing without it |
| `attribution-env.ts` | `withAttributionCode(code, fn)` — sets `CELO_ATTRIBUTION_CODE` for the body and restores `process.env` after, including when the body throws. The attribution feature reads `process.env` by default and the EVM adapter takes no env parameter, so a test that wants a code configured has to set the real thing; the RESTORE is the half that matters, because missing it leaves every later test in the file running with a code set — a false green. Shared by `evm-adapter` and `evm-relay`, which had two different copies of it (#83) |
| `anvil.ts` | `startAnvilFixture(port)`, `sendUnsigned()`, `signPermit()`, `ANVIL_KEYS`, `ANVIL_CHAIN_ID`, `anvilSkip` — a REAL EVM node with the repo's TendaEscrow + mock USDC deployed and the dev accounts funded, shared by every `*.anvil.test.ts`; each suite picks its own port because files run concurrently |
| `litesvm.ts` | `startLiteSvm()`, `litesvmRpc()`, `litesvmRelayer()`, `litesvmSkip` — the server's Solana read seam and relayer write path over LiteSVM running the REAL `tenda_escrow.so`, so a transaction the server built is proven to execute on the program the chain runs |
| `cursor-store.ts` | `fakeCursorStore()` — in-memory `CursorStore` for the polling-listener suites, recording live, history and adoption writes IN ORDER so a test can assert that live is persisted before history runs, and that adoption is the ONE atomic write it has to be (#35) |
| `redis.ts` / `chain.ts` | Type surfaces only — concrete impls live in the suites that need them |

The Agent API suites' ajv configuration (`strictAjv`, `agentApiAjv`, `COMPONENT_REF_PREFIX`) and `plainProse` live in the package, as `@tenda/api-doc/testing`, so the suites that moved into `packages/api-doc/test` and the two that stayed here import one copy.

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
import { migrateOnBoot } from '@server/lib/boot/migrate'
```
