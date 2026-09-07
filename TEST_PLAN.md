# Tenda Test Plan — 90%+ coverage, phased E2E

Goal: enforced **90% line / 85% branch** coverage across all four TS surfaces,
plus a thin true-E2E layer for critical flows. Scope confirmed: Mobile, Shared,
Admin, Server. Style: **Phase 1** unit+integration to the number, **Phase 2** real
flow automation for happy paths only.

Standing contract: positive **and** negative cases, real assertions, no
false-confidence tests, document (never silently drop) any coverage exclusion.

**Standing principle (added 2026-07-04, from the permit effort): server-built
calldata must execute against a real node.** Unit tests that only decode our
own ABI encoding are self-referential — they can't catch a missing approval,
a wrong domain hash, or fee math that reverts on-chain. Every EVM
builder/adapter path that produces calldata gets exercised end-to-end in
`apps/server/test/integration/evm-lifecycle.anvil.test.ts` (spawns `anvil`,
deploys the REAL forge artifacts, broadcasts the builder's actual output;
self-skips without anvil, and CI installs foundry so it never self-skips
there). Origin: the missing-ERC-20-approval gap shipped precisely because no
test ever ran the built create-escrow calldata against a chain.

---

## Review pass 2 — issues & gaps (must read before executing)

These were found by checking the plan against the *actual* CI and harness, not
in the abstract. The first is structural and changes Phase 0 materially.

> **EXECUTION UPDATE (2026-06-14):** decisions G1 + test-DB resolved by the user.
> - **G1 gate location → option A** (per-PR + postgres service). **Phase 0a (#103)
>   DONE:** `ci.yml` now runs the server full-c8 suite against a postgres service
>   (harness migrates it; no Redis), plus gated shared (c8) + a new admin (vitest)
>   job; mobile jest wires in once #101 lands. Header comment supersedes the
>   external testing-strategy doc's "integration is nightly-only" note.
> - **Test DB → created.** `tenda_test` exists on local postgres, migrated to the
>   `0005` baseline. Server baseline **measured** (see below). The harness needs
>   only postgres (Redis stays a 501 stub).
> - **Shared (1A) DONE:** 102 tests, 100% lines/branch/funcs/stmts, gate live.
> - **Admin tooling (0b) DONE:** vitest+jsdom+RTL harness green.
> - **Admin (1C) DONE:** 148 tests, **98.1% lines / 85.21% branch** — gate live
>   (lines 90 / branch 85 / stmts 90 / funcs 85, the last floored as the inline-
>   JSX-arrow metric lags per the plan caveat). Covers lib, all components
>   (shadcn `ui/**` excluded as vendored), `api/client`, and all 14 pages +
>   login; RSC layouts/root-page excluded → Phase 2 Playwright.
> - **Server baseline (0b) DONE / gate floor set (#97):** with honest `all:true`
>   denominator and exclusions (entry `server.ts`, ops `scripts/**`, type-only
>   `*/types.ts`, migrations, `*.d.ts`): **75.4% lines / 83.4% branch / 78.5%
>   funcs**, 554 pass / 3 skip / 0 fail. Gate floor wired at lines 75 / branches
>   83 / funcs 78 / stmts 75 in `apps/server/.c8rc.json`; **1B (#98) ratchets it
>   toward 90/85** as gaps close.

> **EXECUTION UPDATE (2026-07-02):** current state of the tracks.
> - **Server:** 876 tests (873 pass / 3 skipped = live-Redis gated), coverage
>   **88.7% lines / 85.0% branch / 86.7% funcs**; gates ratcheted to
>   81/82/80/81. #98 (→ 90) remains open.
> - **Mobile harness (0c/#101) DONE:** jest-expo + RTL, 240 tests green
>   (`pnpm --filter tenda-mobile test`); coverage track #102 (→ 90) open.
> - **Contracts:** EVM 38/38 forge tests at 100% line/branch/func coverage;
>   Solana 85/85 litesvm with every instruction covered ± (not part of the
>   four-surface c8 goal, tracked in contracts.yml).
> - **G1 is resolved** (option A, per-PR postgres service) — the "unresolved"
>   bullet in *Honest caveats* below predates this and is superseded.
> - Phase 2 (thin E2E, #104) not started.

> **EXECUTION UPDATE (2026-07-04, permit Stage E):** EIP-2612 permit + approval
> flow fully tested across layers — contract (forge, incl. `*WithPermit` +
> griefing/replay negatives), server (permit helpers unit vectors anchored to
> the REAL Base Sepolia USDC `DOMAIN_SEPARATOR`, adapter encode/negative
> matrix, HTTP-surface negatives incl. the blockchain-route 404 regression,
> and the anvil lifecycle suite per the standing principle above), mobile
> (allowance module, permit decision table, dispatch approval-hint ordering,
> token-approvals screen component test). Contract-side invariant/stateful
> fuzzing (#123) **DONE 2026-07-04** — `contracts/evm/test/invariant/`:
> handler-based suite (fail_on_revert, every entry point incl. both permit
> functions, front-run-consumed permits, garbage permits, mid-flight admin
> param changes, time warps) checking exact ERC20+native solvency, treasury
> fee conservation, total value conservation, and ghost-model equivalence
> after every call, plus an afterInvariant liquidation sweep proving no
> escrow can be left stuck. Runs in `forge test` (so contracts.yml CI);
> mutation-checked (a planted ±1 fee drift fails the treasury invariant).

> **EXECUTION UPDATE (2026-07-04, contract-test gap closure):** the gap
> assessment's findings are closed. (1) **Parity rule**: the EVM contract now
> enforces Solana's `seekerFee <= fee` (`SeekerFeeAboveFee`) — was a real
> validation divergence the enum/limits parity gate couldn't see; ABI
> re-synced. (2) **Settlement golden vectors**: `contracts/settlement-vectors.json`
> is consumed by BOTH `contracts/evm/test/SettlementParity.t.sol` (forge)
> and `contracts/solana/tests/settlement-parity.test.ts` (litesvm) — the
> independently implemented fee/split math is now cross-pinned; a rounding
> divergence is unmergeable. (3) **Push-payment griefing** machine-checked
> (`TendaEscrowEdges.t.sol`): a reverting-receiver party blocks only payouts
> to itself; every dispute keeps ≥1 executable resolution. (4) **Exact
> deadline boundaries** tested on EVM; Rust comparison operators verified
> identical (accept/submit strictly-before; refund/reclaim/claim
> at-or-after). (5) **Solana stateful harness**
> (`tests/stateful-random.test.ts`): seeded 110-action random sequences over
> mixed SOL+SPL pools with per-step vault-solvency + ghost-model-equivalence
> checks and a liquidation drain — mutation-checked. Plus: admin-rotation ×
> in-flight tests, `compute_fee` u64-overflow fail-closed test, and the
> hostile-asset non-goal documented in the contract header. EVM forge 65/65;
> Solana litesvm 91/91.

### G1 (CRITICAL) — the coverage gate can't run in CI as the repo stands
- `.github/workflows/ci.yml` provisions **no postgres**. The server CI job runs
  **only** `tsx --test "test/unit/*.test.ts"` (393 cases). The **18 integration
  files / 119 cases (~23% of the suite) never run in CI**, and `npm test` (the c8
  full run) is **never invoked in CI** — coverage is local-only and the
  "coverage-delta" gate is explicitly *unwired* ("when a remote exists").
- The server's routes/features are covered by the **integration** tests, which are
  DB-gated (`TEST_DB_CONFIGURED = TEST_DATABASE_URL !== undefined`). So a coverage
  number computed from unit-only is far below 90% **by construction** — the gate is
  meaningless until integration runs under c8 **with a database**.
- This also collides with the **existing documented strategy** (testing-strategy
  § CI gates) that deliberately keeps integration *nightly/pre-release, never
  per-PR*. Enforcing 90% per-PR reverses that decision.
- **Good news:** Redis is **not** needed — the harness `delete`s `REDIS_URL` and the
  queue stays a 501 stub. Only postgres must be provisioned.
- **DECISION REQUIRED (yours):** where does the 90% gate run?
  - **(A)** Add a postgres **service container** to a per-PR coverage job (runs
    migrations → `npm test` with c8 threshold). ~+30–90s per PR, reverses the
    "integration is nightly" stance but gives real per-PR protection. *(Recommended.)*
  - **(B)** Keep the fast unit job per-PR; run the **full c8 gate nightly** only.
    PRs stay fast but a coverage regression can merge and is caught next night.
  - Either way Phase 0 must: add the PG service, run `drizzle-kit migrate` against
    it, set `TEST_DATABASE_URL`, and switch the gating step to the c8 full suite.

### G2 — "measure the baseline" itself needs the DB
Corollary of G1: the Phase-0 baseline measurement must run the **full** suite with
`TEST_DATABASE_URL` set, not the unit subset. I can run it locally (a tenda_test DB
exists) to size 1B; it can't be sized from CI as-is.

### G3 — time/non-determinism is unaddressed
`gigDeadlineMeta` + countdown chips use `Date.now()`; chat polling uses `setTimeout`;
reanimated drives timers. Without a controlled clock these tests flake. Add to Phase 0:
per-runner fake-timer policy — `jest.useFakeTimers()` + a fixed `setSystemTime` (mobile),
vitest `vi.useFakeTimers()` (admin), and inject/freeze `Date.now` in shared/server pure
tests. Deadline/countdown/polling tests are written against a frozen clock, never wall time.

### G4 — exclusion integrity (don't let the % lie)
If mobile excludes `wallet/`, `ws`, `notifications`, `secure-store`, `device` **and**
router-heavy screens, "90% of what's left" can mask low absolute coverage. Rule added:
each package's coverage report prints **absolute covered/total statements**, the
**enumerated** exclusion list, and the **excluded fraction must stay ≤ 15%** of
statements (anything higher needs a written justification in this doc). The gate is on
the *included* set; the *excluded* fraction is reported alongside so the number can't hide.

### G5 — admin vitest needs Next-specific mocks (not just jsdom)
Rendering Next 16 client components under vitest+jsdom also requires mocking
`next/navigation` (`useRouter`/`useSearchParams`/`redirect`), `next/link`, `next/image`,
and resolving the `@/` alias in `vitest.config.ts`. Any `next/headers`/`server-only`
import fails fast — reinforces the RSC caveat (those pages are Playwright-only).

### G6 — shared `api/` directory needs an include/exclude decision
16 `api/contracts/*` + `endpoint.ts` + `routes.ts` + `api/config.ts`. Decision:
**include** runtime logic (URL building in `endpoint`/`routes`, `api/config`) and test
representative zod/contract `.parse` validators (real branch value); **exclude** pure
type re-exports. Stated so it isn't silently dropped from the denominator.

### G7 — `apps/tendahq` is explicitly OUT of scope
Separate, untouched app. Not part of the four surfaces; no tests added, not in the gate.

### Minor notes
- **G8:** the server `test` script runs a full `build:ts` before tests even though
  execution is ts-node-against-src; the coverage job can skip that build to halve
  compile time (tests resolve `@server/*` → `src/` via ts-node, so c8 `--include
  'src/**'` is correct).
- **G9:** CI must run `drizzle-kit migrate` against the fresh PG service **before**
  the suite (the harness assumes a migrated baseline).
- **G10:** mobile harness setup (jest-expo SDK54 + RN 0.81 New Architecture +
  reanimated-4 worklet init + unistyles Nitro mock) is a **spike, ~1 day**, not part
  of the 0.5-day Phase-0 estimate — budget it separately.

---

## Verified baseline (2026-06-13)

| Surface | Tests | Runner today | Coverage tool | Notes |
|---|---|---|---|---|
| Server | 57 files / ~557 | `node:test` + `ts-node` | `c8` (wired, **ungated**) | add threshold; measure first |
| Admin | 2 files / ~9 | `tsx --test` (**no DOM**) | none | logic-only today |
| Mobile | **0** | **none** | none | Expo SDK 54, RN 0.81, React 19.1 |
| Shared | **0** | none | none | **CommonJS** (clean for node:test) |
| Contract | 31 (Foundry) | `forge test` | — | already green, out of scope here |

### Version/fact checks that shaped the tooling
- Mobile: `expo ~54`, `react-native 0.81`, `react 19.1`, `react-native-unistyles ^3`,
  `react-native-reanimated ~4`. **Both unistyles and reanimated ship jest mocks**
  (`react-native-unistyles/mocks`, `react-native-reanimated/mock.js`) → component
  tests are feasible. `jest-expo` is **not yet installed**.
- Shared: `module: CommonJS`, no `type: module` → `node:test -r ts-node/register` +
  `c8` mirrors the server setup exactly (no ESM-loader friction).
- Admin: `next 16.2`, `react 19.2`. **No jsdom/vitest/RTL present.** Existing tests
  are pure logic under `tsx --test`, which has no DOM — component/page rendering
  requires a real DOM runner.
- Server: no `.c8rc`/`nyc` config file; the gate must go in the `c8` CLI flags.

---

## Tooling decisions (one idiomatic stack per runtime)

| Surface | Test runner | DOM | Coverage | Why |
|---|---|---|---|---|
| **Shared** | `node:test` + `ts-node/register` | n/a | `c8` | pure CJS TS; mirror server |
| **Server** | `node:test` (existing) | n/a | `c8` + threshold | keep 557 green tests; just gate |
| **Admin** | **`vitest`** | **jsdom** | vitest v8 | only DOM runner that renders React 19 client components; migrate the 2 logic tests |
| **Mobile** | **`jest-expo@~54`** + `@testing-library/react-native` | RN test env | jest v8 | the supported Expo SDK 54 preset |

> Three coverage tools (c8, vitest-v8, jest), each the standard for its runtime.
> Not worth forcing a single tool across Node + React-DOM + React-Native.

---

## Phase 0 — Tooling, gates, baseline (~0.5 day)

1. **Measure server c8 baseline** (`--include 'src/**' --all`) → ranked
   uncovered-file list. This sizes Phase 1B for real instead of guessing.
2. **Shared**: add `c8` + `ts-node` devDeps, `test`/`test:coverage` scripts, a
   `test/` dir, `.c8rc.json` (`include: src/**`, exclude db/schema + idl + types).
3. **Server**: add `--check-coverage --lines 90 --branches 85 --include 'src/**'`
   to the c8 invocation. Start the threshold at the measured baseline, ratchet to
   90 as gaps close (never a giant red CI bar).
4. **Admin**: add `vitest` + `jsdom` + `@testing-library/react` + `@vitejs/plugin-react`;
   `vitest.config.ts` (jsdom env, v8 coverage, include `app/**` + `lib/**` + `api/**`);
   migrate `dispute-thread.test.ts` + `nav.test.ts` from node:test → vitest (mechanical).
   Replace the `test` script; drop `tsx --test`.
5. **Mobile**: add `jest-expo` + `@testing-library/react-native` + `@types/jest`;
   `jest.config.js` (preset `jest-expo`, `transformIgnorePatterns` for RN/expo/reanimated/
   unistyles ESM), `jest.setup.ts` wiring the unistyles + reanimated mocks and
   gesture-handler/secure-store/expo-router stubs; `test`/`test:coverage` scripts.
6. **Root**: add `test` + `test:coverage` tasks to `turbo.json` (currently absent).
7. **CI (the big one — see G1):** add a **postgres service container** to the server
   job (no Redis needed), run `drizzle-kit migrate` against it, set
   `TEST_DATABASE_URL`, and switch the gating step from `tsx --test test/unit/*` to the
   **c8 full suite** so integration coverage counts. Resolve the **gate-location
   decision (A per-PR vs B nightly)** first — it shapes this job. Add net-new
   `test`/`coverage` CI steps for shared (node), admin (vitest), mobile (jest); none
   run tests today.

**Exit:** `pnpm test:coverage` runs all four locally; CI runs the **DB-backed** server
suite under c8 + the three other suites; each prints absolute covered/total + exclusion
list (G4); thresholds start at measured baseline, ratchet to 90 per package.

---

## Phase 1 — Coverage to 90% (ordered by ROI)

### 1A. Shared (do first — pure logic, zero mocks, highest leverage)
Both server and mobile depend on this math, so bugs here are systemic.
- `utils/fees.ts`, `utils/validation.ts`, `utils/cross-border.ts`,
  `utils/gig-utils.ts`, `utils/wallet.ts`, `utils/auth-message.ts`
- `constants/permissions.ts` — full `hasPermission` matrix, **every role ×
  permission**, positive + negative.
- `constants/` invariants: `assets`, `errors`, `escrow`, `moderation`, `categories`,
  `currencies` (shape + no-dupes + lookups).
- Boundary/negative on every fee/deadline/validation branch (zero, overflow,
  out-of-range, malformed).
- Exclude from denominator: `db/schema/**`, `idl/**`, `abi/**`, `types/**` (pure
  type decls / generated) — documented in `.c8rc`.

### 1B. Server — close the measured gap to 90%
- Drive from the Phase-0 ranked list. Use the existing `fastify.inject` harness.
- Likely thin spots: `chains/evm/*` (dormant adapter — verify/builders/rpc),
  `features/fiat-rails/webhooks`, `features/moderation`, `features/reputation`
  guards, `lib/admin-otp` edge branches, webhook HMAC verifiers.
- Negative paths: authn failure, role/permission rejection, malformed payloads,
  idempotency replays, half-configured chain env.
- Genuinely unreachable defensive branches: test or annotate `c8 ignore` **with a
  reason comment** — never blanket-exclude to hit the number.

### 1C. Admin (vitest + jsdom)
- Logic: `lib/api.ts` (401 bounce, base-url fallback, `/v1/auth/` exclusion),
  `lib/auth.ts`, `lib/use-session.ts`, `lib/nav.ts` (extend), `lib/dispute-thread.ts`
  (extend), `api/client.ts`.
- Components/pages (client components only — see caveat): config-save guard,
  dispute assignee flow, users role PATCH, login email-OTP form, nav permission
  gating, route guards. Mock `fetch`/api client at the boundary.

### 1D. Mobile (greenfield — largest net-new effort)
Layered by ROI; the 90% number rests mostly on 1+2:
1. **`lib/`** pure helpers — `gig-display`, `date`, `currency`, `fiat`, `chat`,
   `categories`, `upload`, `env`, `reporter`. Pure unit, no mocks.
2. **`stores/`** (Zustand) — call actions/selectors directly, assert state
   transitions; mock `api/client`. `escrow`, `gigs`, `user-gigs`, `chat`, `auth`,
   `pending-sync`, `platform-config`, `exchange-*`, `settings`, `onboarding`,
   `realtime`.
3. **Components** — UI primitives + key composites (GigCardCompact ×3, MessageBubble,
   FeeSummary, moderation sheets, StandingBadge) via RN Testing Library + the
   unistyles/reanimated mocks.
4. **Screens** — render-level for create-gig, chat, exchange detail with mocked API +
   `expo-router`.
- **Boundary-mock + documented coverage exclusion** for unmockable native shims:
  `wallet/adapters/*` (MWA/Phantom/MetaMask), `lib/ws.ts`, `lib/notifications.ts`,
  `lib/secure-store.ts`, `lib/device.ts`. These move to Phase 2 Maestro for real
  coverage; each exclusion is listed in `jest.config` `coveragePathIgnorePatterns`
  with a one-line reason.

---

## Phase 2 — Thin true-E2E (critical happy paths only)

Runs separately from the coverage gate (nightly / pre-release); does **not** count
toward the 90% line number.

- **Mobile — Maestro** (lighter than Detox for Expo): onboarding → wallet-connect
  (mocked signer), create-gig happy path, chat send/receive. Needs an emulator +
  dev-client build.
- **Admin — Playwright**: email-OTP login (dev-code path), claim a dispute, take
  down a report. Needs admin + server running.

---

## Sequencing & effort

| Step | Effort | Gating output |
|---|---|---|
| Phase 0a (CI postgres + full-suite gate, G1/G9) | 0.5–1d | server suite runs in CI |
| Phase 0b (shared/admin/server tooling + baseline) | 0.5d | runners green, thresholds wired |
| Phase 0c (mobile harness spike, G10) | ~1d | jest-expo green on a smoke test |
| 1A Shared | 1d | shared ≥90 |
| 1B Server gap-fill | **IN PROGRESS: 75.4→80.0% lines** (57 tests added incl. escrow-lifecycle transitions — users/profile/reviews/transactions/escrows, subscriptions, reports, conversations+messages, standing, chat-close). Floor ratcheted to 79/81. Branch dipped 83.4→81.9 (denominator effect: partially-covered cold files expose more branches than tests cover — recovers as files complete). **Remaining to 90:** escrow-lifecycle error branches, auth-wallet routes (wallet/link/unlink/set-primary/verify-phone), fiat routes, upload, moderation/preview, ws; external-integration libs (push/openrouter/paymaster/rpc/exchange-rates/gas-seed) need HTTP-mock-or-documented-exclude. | server gate → 90 |
| 1C Admin | 1d | admin ≥90 (client surface) |
| 1D Mobile | 2–3d | mobile ≥90 (lib+stores+components) |
| Phase 2 E2E | 1–2d | Maestro + Playwright smoke |

Commit per sub-phase (project convention), each message carrying its coverage
delta; ratchet the threshold up as suites land.

---

## Honest caveats / known risks

- **Admin RSC limit:** React-DOM testing (vitest+jsdom + RTL) renders **client**
  components only. Next App Router **server components / async pages** cannot render
  under RTL — those rely on Phase 2 Playwright for coverage. Most #90 dashboard pages
  are `'use client'`, so the exposure is small, but any server-rendered page is a
  documented gap, not a tested line.
- **Mobile native modules:** wallet adapters, WebSocket, secure-store, push — mocked
  at the boundary; real behaviour is Phase 2 Maestro. Listed exclusions keep the 90%
  honest (denominator excludes only declared-untestable shims).
- **90% branch is harder than 90% line.** On the gnarliest modules I may land
  ~85% branch / 90% line; the real split gets reported, never papered over.
- **Server gate ratchet:** I will not flip the threshold to 90 until the suite
  actually clears it — interim commits gate at the rising baseline so CI stays green.
- **Phase 2 infra** (emulator, Playwright browsers, both services up) is heavier
  than Phase 1 and may need CI runner changes; kept out of the blocking coverage job.
  Maestro mobile E2E in CI specifically needs an Android emulator (KVM runner) — may
  be **local/nightly only**, not per-PR.
- **Per-PR vs nightly gate (G1) is unresolved** and is yours to decide; the rest of
  the plan assumes option A (per-PR with a PG service). If you pick B, the 90% number
  protects nightly, not merges.
- **Strategy conflict:** enforcing integration coverage per-PR reverses the existing
  testing-strategy doc's "integration is nightly only." That doc should be updated in
  the same change so the two don't contradict.
