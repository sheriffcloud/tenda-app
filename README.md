# Tenda

Tenda is a trustless mobile-first micro-task gig marketplace. Workers and
posters transact through on-chain escrow — multichain (Solana + EVM: BASE,
CELO), no middlemen, no custodial risk.

**Website:** [tendahq.com](https://tendahq.com)

## Monorepo structure

```
apps/
  mobile/       React Native (Expo) — the Tenda app
  server/       Fastify API — REST backend, workers, chain adapters
  admin/        Next.js admin dashboard (disputes, reports, ops) — port 3100
  tendahq/      Vite landing page — tendahq.com
packages/
  shared/       Shared types, DB schema, API contracts, chain manifest, ABI/IDL
contracts/
  solana/       Anchor escrow program (source of truth for the shared IDL)
  evm/          Foundry TendaEscrow.sol for BASE/CELO (source of truth for the shared ABI)
docs/           (../docs) specs + the full setup/deployment guide
```

## Prerequisites

- Node.js ≥ 22, pnpm 10
- PostgreSQL ≥ 16
- Redis (queues/workers): `docker compose -f docker-compose.dev.yml up -d`
- Contracts only: Foundry (`forge`), Anchor 0.32.1

## Getting started

```bash
pnpm install
pnpm build:shared          # required before server/mobile (compiles @tenda/shared)

cd apps/server
cp .env.example .env       # fill in — see ../../docs/production_setup_guide.md
pnpm db:migrate && pnpm db:seed

cd ../..
pnpm dev                   # or: pnpm dev:server / pnpm dev:mobile
```

The full requirements matrix (required vs optional env, contract deployment,
multisig, external services) lives in **`../docs/production_setup_guide.md`**.

Server Docker image (runtime + migrate targets, built from the repo root):
`docker build -f apps/server/Dockerfile .` — deploy notes in the guide § 3.5.

## Useful commands

| Command | Description |
|---|---|
| `pnpm build` | Build all packages |
| `pnpm build:shared` | Build shared package only |
| `pnpm type-check` / `pnpm lint` | Check all packages |
| `pnpm --filter tenda-server test` | Server suite (DB-backed, needs `TEST_DATABASE_URL`) |
| `pnpm sync:abi` / `pnpm sync:idl` | Regenerate shared contract artifacts |
| `pnpm build:apk` / `pnpm build:aab` | Android builds via EAS |

## Tech stack

| Layer | Tech |
|---|---|
| Mobile | React Native, Expo Router, Zustand, WalletConnect/Reown |
| Server | Fastify v5, TypeScript, Drizzle ORM, PostgreSQL, BullMQ + Redis |
| Blockchain | Solana (Anchor) + EVM BASE/CELO (Foundry), config-driven chain registry |
| Auth | Multi-method: wallet signature, email/phone OTP, Google/Apple — JWT |
| Storage | Cloudinary (avatars, proofs, chat attachments) |
| Push | FCM / APNs with Expo Push fallback |
| Infra | pnpm workspaces, Turbo, EAS Build, GitHub Actions, lefthook |

## Smart contracts

In-repo under [`contracts/`](contracts/README.md) — the shared ABI/IDL in
`packages/shared` are generated artifacts guarded against drift by CI and
pre-commit hooks. Deploy runbooks: `contracts/evm/DEPLOY.md` and
`docs/production_setup_guide.md` §§ 4–5.
