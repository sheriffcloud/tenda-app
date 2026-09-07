# tenda-server

Fastify v5 REST API + in-process workers for the Tenda gig marketplace.

## Stack

Fastify v5 · Drizzle ORM + PostgreSQL · BullMQ + Redis · multichain adapters
(Solana web3.js + EVM viem, config-driven) · multi-method auth (wallet
signature, email/phone OTP, Google/Apple → JWT) · Cloudinary · FCM/APNs push
(Expo fallback) · Sentry

## Setup

```bash
cp .env.example .env                # see ../../docs/production_setup_guide.md § 2
pnpm --filter @tenda/shared build   # required before first run
pnpm dev
```

## Database

```bash
pnpm db:generate   # generate migration after schema changes in @tenda/shared
pnpm db:migrate    # apply pending migrations
pnpm db:seed       # manifest-driven chains/assets/config seed (re-run after chain env changes)
pnpm db:studio     # open Drizzle Studio
```

## Env

Required (`loadConfig()` fail-fasts on boot; the full matrix incl. optional
services lives in `.env.example` and the setup guide):

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary signed-upload credentials |
| `API_BASE_URL` | Public base URL — pinned in signed wallet-auth messages |

Chains are activated via `CHAIN_<ID>_*` env against the shared
`CHAIN_MANIFEST` (see `src/chains/README.md`) — no per-chain code changes.

## Docker

`Dockerfile` (build from the **repo root**) has two targets: `runtime`
(default; lean, non-root) and `migrate` (drizzle-kit, run before rolling).
Opt-in boot-time migration: `MIGRATE_ON_BOOT=true` (advisory-locked,
multi-replica safe). Details: setup guide § 3.5.

## Tests

```bash
TEST_DATABASE_URL=postgresql://…/tenda_test pnpm test   # full DB-backed c8 suite
```
