# Tenda

Tenda is a trustless mobile-first micro-task gig marketplace. Workers and
posters transact through on-chain escrow — multichain (Solana + EVM), no
middlemen, no custodial risk.

**Website:** [tendahq.com](https://tendahq.com) · **Roadmap:** [ROADMAP.md](ROADMAP.md)

## Monorepo structure

```
apps/
  mobile/       React Native (Expo) — the Tenda app (Android)
  web/          Next.js web app — browser version of mobile, port 3200
  server/       Fastify API — REST backend, workers, chain adapters, port 3000
  admin/        Next.js admin dashboard (disputes, reports, ops), port 3100
  tendahq/      Vite landing page — tendahq.com
packages/
  shared/       Shared types, DB schema, API contracts, chain manifest, ABI/IDL
contracts/
  solana/       Anchor escrow program (source of truth for the shared IDL)
  evm/          Foundry TendaEscrow.sol (source of truth for the shared ABI)
```

Each app's README covers its own setup and scripts.

## Prerequisites

- Node.js ≥ 22, pnpm 10
- PostgreSQL ≥ 16
- Redis (queues/workers): `docker compose -f docker-compose.dev.yml up -d`
- Contracts only: Foundry (`forge`), Anchor 0.32.1

## Getting started

```bash
pnpm install
pnpm build:shared          # required before anything else (compiles @tenda/shared)

cd apps/server
cp .env.example .env       # fill in — required vs optional is documented inline
pnpm db:migrate && pnpm db:seed

cd ../..
pnpm dev:server            # then dev:mobile, or per-app: pnpm --filter web dev
```

## Root scripts

| Command | Description |
|---|---|
| `pnpm build` / `pnpm build:shared` | Build all packages / shared only |
| `pnpm dev:server` / `pnpm dev:mobile` | Start the API / the Expo dev client |
| `pnpm type-check` / `pnpm lint` | Check all packages |
| `pnpm sync:abi` / `pnpm sync:idl` | Regenerate shared contract artifacts |
| `pnpm build:apk` / `pnpm build:aab` | Android builds via EAS (testnet / production profile) |
| `pnpm bump:version` / `pnpm check:app-version` | App version management |

Note: `pnpm build:shared` does `rm -rf dist` first — never run it while
another package's test suite is running.

## Tech stack

| Layer | Tech |
|---|---|
| Mobile | React Native, Expo Router, Zustand, WalletConnect/Reown |
| Web | Next.js (App Router), Tailwind v4 |
| Server | Fastify v5, TypeScript, Drizzle ORM, PostgreSQL, BullMQ + Redis |
| Blockchain | Solana (Anchor) + EVM (Foundry), config-driven chain registry |
| Auth | Multi-method: wallet signature, email/phone OTP, Google/Apple — JWT |
| Storage | Cloudinary (avatars, proofs, chat attachments) |
| Push | FCM / APNs with Expo Push fallback |
| Infra | pnpm workspaces, Turbo, EAS Build, GitHub Actions, lefthook |

## Smart contracts

In-repo under [`contracts/`](contracts/README.md) — the shared ABI/IDL in
`packages/shared` are generated artifacts guarded against drift by CI and
pre-commit hooks. EVM deploy runbook: `contracts/evm/DEPLOY.md`.

## Licence

Two licences, split by directory:

| Path | Licence |
|---|---|
| [`contracts/`](contracts/LICENSE) | Apache-2.0 — open source, no strings |
| Everything else | [BUSL-1.1](LICENSE) — source-available; each version becomes Apache-2.0 two years after release |

BUSL permits reading, auditing, modifying and running the code, including
inside your own organisation; it does not permit offering it to third parties
as a hosted escrow, payments or dispute-resolution service. Full explanation in
[LICENSING.md](LICENSING.md); trademark terms in [TRADEMARK.md](TRADEMARK.md).
