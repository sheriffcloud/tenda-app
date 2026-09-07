# tenda-mobile

React Native app for the Tenda gig marketplace. Android only (for now).

Expo SDK · Expo Router (typed routes) · Unistyles · Zustand · multi-transport
wallets (Solana MWA, Phantom universal links, Reown/WalletConnect for EVM —
see `wallet/README.md`) · Sentry

## Setup

```bash
pnpm install                        # from the repo root
pnpm --filter @tenda/shared build   # required before first run
pnpm dev                            # dev client (needs a development build on device/emulator)
```

Point the app at a local API via the env in `.env` / `app.config` (see
`.env.example`).

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Expo dev client |
| `pnpm android` | Build + run on connected device/emulator |
| `pnpm test` / `pnpm test:watch` / `pnpm test:cov` | jest-expo suite |
| `pnpm type-check` / `pnpm lint` | tsc / expo lint |
| `pnpm build:apk` | Android APK via EAS (`testnet` profile) |
| `pnpm build:apk:dev` / `pnpm build:apk:preview` | EAS `development` / `preview` profile |
| `pnpm build:aab` | Android AAB via EAS (`production` profile) |

EAS profiles are defined in `eas.json`; each sets `APP_ENV` explicitly — the
profile name is not the environment.

## Smart contracts

In-repo: [`../../contracts/`](../../contracts/README.md) (Solana Anchor +
EVM Foundry; the shared IDL/ABI in `@tenda/shared` are generated from them).
