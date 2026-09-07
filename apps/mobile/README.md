# tenda-mobile

React Native app for the Tenda gig marketplace. Android only (for now).

## Stack

Expo SDK · Expo Router (typed routes) · Unistyles · Zustand · multi-transport
wallets (Solana MWA, Phantom universal links, Reown/WalletConnect for EVM,
see `wallet/README.md`) · Sentry

## Setup

```bash
pnpm install
pnpm --filter @tenda/shared build   # required before first run

# Start dev client (requires a development build installed on device/emulator)
pnpm dev
```

## Tests

```bash
pnpm test        # jest-expo suite
npx tsc --noEmit && npx expo lint
```

## Builds

```bash
pnpm build:apk   # Android APK via EAS (preview profile → staging)
pnpm build:aab   # Android AAB via EAS (production profile)
```

EAS build profiles: `development` → `preview` (staging) → `production`.
Set `APP_ENV` in each profile in `eas.json`, do not rely on the profile name.

## Smart contracts

In-repo: [`../../contracts/`](../../contracts/README.md) (Solana Anchor +
EVM Foundry; the shared IDL/ABI in `@tenda/shared` are generated from them).
