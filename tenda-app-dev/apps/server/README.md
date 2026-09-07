# tenda-server

Fastify v5 REST API + in-process workers for the Tenda gig marketplace.

Fastify v5 · Drizzle ORM + PostgreSQL · BullMQ + Redis · multichain adapters
(Solana web3.js + EVM viem, config-driven) · multi-method auth (wallet
signature, email/phone OTP, Google/Apple → JWT) · Cloudinary · FCM/APNs push
(Expo fallback) · Sentry

## Setup

```bash
cp .env.example .env                # required vs optional documented inline
pnpm --filter @tenda/shared build   # required before first run
pnpm db:migrate && pnpm db:seed
pnpm dev                            # http://localhost:3000
```

Required env (`loadConfig()` fail-fasts on boot; the full matrix incl.
optional services lives in `.env.example`):

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary signed-upload credentials |
| `API_BASE_URL` | Public base URL — pinned in signed wallet-auth messages |

Chains are activated via `CHAIN_<ID>_*` env against the shared
`CHAIN_MANIFEST` (see `src/chains/README.md`) — no per-chain code changes.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Dev server (tsx watch) |
| `pnpm build` / `pnpm start` | Compile to `dist/` / run compiled server |
| `pnpm db:generate` | Generate a migration after schema changes in `@tenda/shared` |
| `pnpm db:migrate` / `pnpm db:seed` | Apply migrations / manifest-driven chains+assets+config seed (idempotent — re-run after chain env changes) |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm test` | Full DB-backed c8 suite — needs `TEST_DATABASE_URL` (e.g. `postgresql://postgres:postgres@localhost:5432/tenda_test`) |
| `pnpm test:unit` / `pnpm test:file <path>` | Unit tests only / a single file |
| `pnpm admin:grant-email -- <user-id> <email>` | Grant admin email login (admin dashboard bootstrap) |
| `pnpm type-check` / `pnpm lint` | tsc / eslint |

## Docker

`Dockerfile` (build from the **repo root**) has two targets: `runtime`
(default; lean, non-root) and `migrate` (drizzle-kit, run before rolling).
Opt-in boot-time migration: `MIGRATE_ON_BOOT=true` (advisory-locked,
multi-replica safe).
