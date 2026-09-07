# Apps

Deployable applications in the Tenda monorepo. All of them consume
`@tenda/shared` — build it first (`pnpm build:shared`).

## mobile (`tenda-mobile`)

React Native app built with Expo. Currently Android-only (iOS coming).

- **Framework:** Expo SDK, Expo Router (file-based, typed routes)
- **Styling:** Unistyles · **State:** Zustand
- **Wallets:** adapter-based multi-transport — Solana MWA (Android), Phantom
  universal links (iOS), Reown/WalletConnect (EVM) — see `mobile/wallet/README.md`
- **Build:** EAS Build — profiles: `development`, `preview` (staging), `production`

```bash
pnpm dev:mobile      # start dev client
pnpm build:apk       # Android APK (preview profile)
```

## server (`tenda-server`)

REST API + workers powering the mobile app and admin dashboard.

- **Framework:** Fastify v5 · Drizzle ORM + PostgreSQL · BullMQ + Redis
- **Chains:** config-driven adapter registry — Solana (web3.js) + EVM (viem)
- **Auth:** multi-method (wallet signature Solana/EVM, email/phone OTP,
  Google/Apple) → JWT
- **Storage:** Cloudinary (avatars, proofs, chat attachments)
- **Push:** FCM / APNs with Expo Push fallback

```bash
pnpm dev:server
```

Env: see `apps/server/.env.example` + `../docs/production_setup_guide.md`.
Docker image (runtime + migrate targets): `apps/server/Dockerfile`.

## admin (`admin`)

Next.js (App Router) dashboard over the v2 admin API — disputes/mediation,
reports & takedown, users, escrows, featured curation, moderation, config,
fiat, finance, metrics, push. Email-OTP login; permission-tagged nav from the
shared `ROLE_PERMISSIONS` map.

```bash
pnpm --filter admin dev   # http://localhost:3100 (API defaults to :3000)
```

See `apps/admin/README.md` for auth bootstrap + the `ADMIN_ORIGIN` deploy note.

## tendahq

Landing page for [tendahq.com](https://tendahq.com) — Vite + React + Tailwind v4.
Routes: `/`, `/terms`, `/privacy`.

```bash
cd apps/tendahq && pnpm dev
```
