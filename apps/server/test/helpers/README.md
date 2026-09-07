# test/helpers/

Shared infrastructure for the unit + integration suites (full c8 run:
`TEST_DATABASE_URL=… pnpm test`).

| File | Purpose |
|---|---|
| `test-app.ts` | `useTestApp()`/`buildTestApp()` — real Fastify app over a dedicated Postgres (`TEST_DATABASE_URL`) with a fake chain registry; cross-process suite lock, `resetDb()`, DB-backed fixtures (`createUser()`, `createEscrow()`, `makeTransactable()` for the 9D gate, …) |
| `escrow-states.ts` | `partiedEscrow()`, `openGig()`, request-body builders shared by the `test/integration/escrows-*` route-matrix suites |
| `fixtures.ts` | `userFixture()`, `walletFixture()`, `escrowFixture()`, … typed object factories |
| `solana.ts` | `fakeSolanaRpc()`, escrow/platform account encoders + event-log builders for verify-tx tests |
| `auth-message.ts` | `issueNonce()` + `buildAuthMessage()` — wallet-auth flow helpers |
| `admin-auth.ts` | `issueAdminCode()` — admin email-OTP login helper |
| `redis.ts` / `chain.ts` | Type surfaces only — concrete impls live in the suites that need them |

The fastify-cli `test/helper.ts` (`build()`) predates these and stays for the
suites that use it; new helpers extend rather than replace it.

## Conventions

- Helpers exist so every test reads "what's being asserted," not "how DB /
  chain mocks are wired."
- Anything touching an external service lives in `test/integration/` and is
  gated on `TEST_DATABASE_URL` (`{ skip }` otherwise). No Redis dependency —
  the harness deletes `REDIS_URL` so the queue stays a 501 stub.
- No `any` / `unknown` casts (project rule); fixtures expose narrow types.
- The DB is NOT truncated between tests — use unique values (e.g. random
  category names) instead of relying on a clean slate.

## Importing

Tests use the `@server/*` alias exactly like runtime code — `test/tsconfig.json`
maps it (paths resolve relative to the declaring config, hence `../src/*`):

```ts
import { migrateOnBoot } from '@server/lib/boot-migrate'
```
