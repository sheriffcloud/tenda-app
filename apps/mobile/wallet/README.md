# Wallet (adapter-based multi-transport)

**Status: promoted (live).** This started as a spike validating self-custodial
multichain (Solana + EVM) via a per-wallet **adapter** model; it now backs the
real login (`app/(auth)/connect-wallet.tsx`) and wallet-link
(`app/settings/linked-wallets.tsx`) flows, end-to-end to the server-nonce auth
endpoints. Each transport (Reown/WalletConnect for EVM, Solana MWA, Phantom
universal links) is isolated behind a uniform `WalletAdapter` interface, so
consumers never know which protocol an entry speaks. Transports swap per
platform without touching the consumer surface.

Device-verification status is at the bottom, the **Android-Solana (MWA)**
path is device-proven; EVM sign + iOS-Phantom device passes are pending
(tracked as #68 until it was dropped from the task list 2026-07-01; the code
paths are unit-tested).

## Architecture

Screens drive the picker directly and the store owns the session; the only
React provider is the thin `ReownProvider` AppKit requires (#110, a pure
connection-signal bridge, no wallet state in React). The MWA adapter owns its
own persisted token (AsyncStorage), so escrow-tx signing reads it from the
adapter, not the auth store.

```
app/(auth)/connect-wallet.tsx   app/settings/linked-wallets.tsx
  (login: signInWithWallet)       (link: linkWalletWith, forceFresh)
            │                              │
            └──────────► <WalletPicker> ◄──┘
                              │ onSelect(adapter)
                              ▼
                      adapters/registry.ts
                  (WalletAdapter[] · isAvailable() per device)
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
  walletconnect.ts       solana-mwa.ts          phantom.ts
  Reown AppKit (EVM)     Solana MWA (Android)   universal links (iOS)
        │                     │                     │
        └─── adapter.authenticate(buildMessage) ────┘   ← connect + sign nonce
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
        wallet/auth.ts                  wallet/dispatch.ts
  nonce → authenticate → POST      escrow UnsignedTx → sign + broadcast
  /v1/auth/{wallet,link-wallet}    (solana-mwa.signAndSendStored /
                                    walletconnect.sendEvmTransaction)
```

**Moved to `@tenda/shared/src/wallet/` (2026-08-15, shared with web):** the
canonical account types (`WalletAccount` — formerly `SpikeAccount` — and
`SignMessageResult`/`AuthenticateResult`; the old local `Namespace` union is
shared `ChainNamespace` now), `WalletError`/`WalletErrorCode`, the
`connectThenSign` + `isUserRejection` composer, `classifyConnectError`, the
EVM JSON-RPC helpers (`evm-rpc`), and the whole balance-reader stack
(fetch-based solana + evm readers, `readWalletBalances`, `sumUsdcRaw`,
`resolveWalletSection`, tx-copy). Import all of those from `@tenda/shared`.

Files under `apps/mobile/wallet/`:

| File | Purpose |
|---|---|
| `config.ts` | Single-source `metadata`, env-driven `SOLANA_NETWORK` + `WALLET_CHAINS` (CAIP-2 ids) |
| `auth.ts` | `signInWithWallet` / `linkWalletWith`, nonce ↔ server orchestration |
| `dispatch.ts` | `signSendAndReport`, routes a server-built `UnsignedTx` to the right transport (`solana-tx` → MWA, `evm-tx` → WalletConnect; `evm-userop` blocked on #47 paymaster). Consumes the server's `approval` hint (allowance-before-broadcast) and exports `resolveEvmFrom()`, the single EVM-account resolution shared with the permit flow |
| `index.ts` | `getTransactionStatus` (Solana tx status via solana-rpc) + convenience re-exports; the balance helpers and their web3.js `Connection` left with the shared-reader convergence |
| `balances/` | Mobile's OWN layer over the shared readers: `readSpendableBalance` + `ensureSufficientBalance` (tx pre-flight) and the targeted `readAssetBalance`; readers/fan-out live in `@tenda/shared` |
| `allowance/` | Reusable ERC-20 allowance module: `readAllowance` / `sendApprove` / `waitForReceipt` / `ensureAllowance`, backs both dispatch's approve fallback and the Token-approvals settings screen |
| `permit.ts` | `buildPermitFor()`, fetches the server-built EIP-2612 typed data (`/v1/blockchain/permit-payload`), signs via `eth_signTypedData_v4`, returns the wire permit body; `undefined` = caller falls back to approve |
| `reown/` | AppKit config + EVM network defs (`networks.ts`, RPCs come from the shared `CHAIN_MANIFEST`) |
| `picker.tsx` | `<WalletPicker>`, controlled BottomSheet listing adapters with installed badge |
| `wallet-icon.tsx` | Rounded `Image`-based wallet icon |
| `adapters/types.ts` | `WalletAdapter` interface (connect / sign / **authenticate** / disconnect / restore) |
| `adapters/registry.ts` | Adapter list + `findAdapter` / `requireAdapter` |
| `adapters/detect.ts` | `canOpenScheme()` wrapper over `Linking.canOpenURL` |
| `adapters/walletconnect.ts` | Reown/WalletConnect EVM adapter (AppKit session; `sendEvmTransaction`) |
| `adapters/mwa-shared.ts` | Shared MWA helpers (auth/retry/error classification) |
| `adapters/solana-mwa.ts` | Generic Android-Solana entry (MWA routes via OS) + `signAndSendStored` |
| `adapters/phantom.ts` | iOS Phantom universal-link transport (X25519 + nacl.box) |

## Transport history (why the EVM path is Reown now)

The spike originally used **MetaMask Connect** for EVM and rejected
WC/Reown (stuck pairings, relay DNS flakiness, Pro-gated multi-namespace).
MM Connect's `personal_sign` then proved unfixable on RN, the approval sheet
never rendered (`invokeMethod` timeout, below our layer), so #110–#112
swapped the EVM adapter to **Reown AppKit/WalletConnect** behind the same
`WalletAdapter` interface: a thin provider + pure connection-signal bridge,
EVM-namespace only (free tier), consumers untouched. Solana stays on MWA
(Android) + Phantom universal links (iOS), the adapter model is exactly what
made this transport swap a two-file change.

## ERC-20 funding: permit first, approve fallback

EVM escrow funding (create, and dispute bonds) needs the escrow contract to
`transferFrom` the user's token. Two paths, decided per call:

1. **EIP-2612 permit (preferred, one wallet interaction).** Before the
   create/dispute API call, the flow asks `buildPermitFor()` (`permit.ts`):
   it checks the chain registry (`supports_permit` on the asset, pure
   config), asks the server for the full typed-data payload
   (`POST /v1/blockchain/permit-payload`, the client **never** constructs
   EIP-712 domains), signs it with `eth_signTypedData_v4`, and rides the
   signature in the request body. The server then encodes
   `createEscrowWithPermit`/`disputeEscrowWithPermit` so approval + escrow
   land in ONE transaction.
2. **Approve fallback (two wallet interactions).** When permit is
   unavailable (non-permit token, live `DOMAIN_SEPARATOR` drift →
   `PERMIT_UNAVAILABLE`, or the user's wallet can't sign typed data), the
   server's unsigned `evm-tx` carries an `approval` hint; `dispatch.ts` runs
   `ensureAllowance()` (read → approve → wait for receipt) **before**
   broadcasting, skipping the approve when the standing allowance already
   covers the amount.

`buildPermitFor` returns `undefined` for every "fall back" condition and
**throws** only on real errors and user declines, a decline must abort the
flow, not silently downgrade it. Standing allowances are user-visible and
editable at **Settings → Token approvals** (`app/settings/token-approvals.tsx`,
rows straight from the chain registry).

## Chain config (single source)

`config.ts` is the **only** place env → network is encoded:

- `SOLANA_NETWORK`, `Cluster` (`mainnet-beta` in prod, else `devnet`).
- `WALLET_CHAINS`, CAIP-2 ids the **server** registers: `solana` via the shared
  `solanaChainId(SOLANA_NETWORK)` (NOT the genesis-hash form, that was a spike
  bug that 400'd the server), `eip155` Base / Base-Sepolia by env.

`auth.ts` pins `WALLET_CHAINS[account.namespace]` on every signature, the
server only verifies against registered chains, so the account's own `chainId`
is never trusted for auth. EVM AppKit networks (`reown/networks.ts`) source
their RPC URLs from the shared `CHAIN_MANIFEST` (`requireEvmPublicRpcUrl`).

## Picker layout

Adapters' `isAvailable()` is what determines visibility per platform:

| Platform | Entries shown | Transport |
|---|---|---|
| Android | EVM Wallet, Solana Wallet | Reown/WalletConnect / MWA (OS picks Phantom/Solflare/etc.) |
| iOS | EVM Wallet, Phantom | Reown/WalletConnect / Phantom universal links |

Android collapses all Solana wallets behind one generic **Solana Wallet**
entry because MWA's `transact()` has no local wallet-targeting API, the OS
routes to the default Solana wallet (or shows a chooser if none is default).
On iOS, each Solana wallet exposes its own universal-link protocol, so
per-wallet entries make sense. EVM wallets ride WalletConnect's own pairing
UI, so one **EVM Wallet** entry covers them all.

## What's installed

| Package | Why |
|---|---|
| `@reown/appkit-react-native` + `@reown/appkit-ethers-react-native` | AppKit EVM session + ethers adapter |
| `@walletconnect/react-native-compat` | RN environment shims (TextEncoder, URL, …), imported before any AppKit code |
| `@walletconnect/utils` | Pairing/session utilities |
| `@solana-mobile/mobile-wallet-adapter-protocol-web3js` | Android Solana transport |
| `@react-native-async-storage/async-storage` | Adapter session/auth-token persistence |
| `bs58` | Solana message/signature encoding |
| `lucide-react-native` | `CircleCheck` filled badge for installed wallets |

`@metamask/connect-evm` (and earlier: `@metamask/sdk-react-native`, wagmi,
viem, @tanstack/react-query, the Coinbase Wallet Mobile SDK) were removed.

## Polyfills

`apps/mobile/shims/polyfills.ts` installs the global `Buffer` early (several
web3/crypto libs read it at import time); `react-native-get-random-values`
installs `crypto.getRandomValues` before it. The rest of the WalletConnect/
Reown environment (TextEncoder, URL, btoa/atob, Linking, Platform, NetInfo)
comes from `@walletconnect/react-native-compat`, which `wallet/reown/config.ts`
imports before any AppKit code. Node-builtin stubs live in `metro.config.js`
(`extraNodeModules`); that file also redirects `whatwg-url`/`webidl-conversions`
to RN-safe builds (admin jsdom otherwise leaks ES2024 Node libs into the
flat-resolved RN bundle).

## Native-config requirement

`apps/mobile/plugins/with-wallet-queries.js` declares wallet deeplink schemes
in `AndroidManifest.xml` `<queries>` and iOS `LSApplicationQueriesSchemes`
(`metamask`, `phantom`, `solflare`). Without these, `Linking.canOpenURL`
returns false on iOS and `openURL` silently fails on Android 11+. The plugin
runs at every `expo prebuild` so the native config stays in sync.

## Device-verification status

The **Android-Solana (MWA)** path is device-proven. The remaining passes were
tracked as **#68** until it was dropped from the task list (2026-07-01),
the code paths below are implemented + unit-tested but not device-verified.

| Scenario | Android | iOS | Notes |
|---|---|---|---|
| Solana Wallet (MWA) connect + signMessage (login) | ✅ |, | OS routes to default Solana wallet. `authenticate` is a one-shot: authorize + `signMessages` in a SINGLE `transact` (one wallet visit). It ALWAYS starts fresh (drops any stored token, passes `null` to `authorizeSession`), reusing a token forces a `reauthorize` that can background the dapp and tear down the association WS mid-session (`Cannot send in CLOSED`). An earlier 2-session split avoided that error but opened the wallet twice (×retry = bad UX); reverted. |
| Solana Wallet (MWA) escrow tx sign + broadcast | ✅ |, | `signAndSendStored` reads the adapter's persisted token; broadcast from app RPC. |
| Solana Wallet (MWA) disconnect | ✅ |, | Local-only (opening the wallet just to revoke is bad UX). |
| EVM Wallet (Reown/WalletConnect) connect + `personal_sign` | ⬜ | ⬜ | Adapter swap #111, unit-tested; device pass pending |
| EVM Wallet escrow send (`eth_sendTransaction`) | ⬜ | ⬜ | `sendEvmTransaction`, device pass pending |
| EVM permit sign (`eth_signTypedData_v4`) + approve fallback | ⬜ | ⬜ | `signEvmTypedData` / `ensureAllowance`, unit-tested; device pass rides the #124 Base Sepolia lifecycle smoke |
| Phantom (iOS universal links) connect + sign |, | ⬜ | Implemented (X25519 + nacl.box, base64 sig); never device-verified |

### Known limitation (post-promotion)

`dispatch.ts` routes `solana-tx` to the MWA adapter only. A **Phantom (iOS)**
login can authenticate but cannot yet sign escrow txs (no Phantom tx-signing
in dispatch). Phantom is `isAvailable: iOS-only`, so the proven Android path
is unaffected; wire Phantom tx-signing when iOS gets a device pass.

(The earlier "EVM-primary login leaves the wallet screen empty" limitation was
fixed by the multichain wallet-screen rework (#121): balances now derive from
`wallets[]` + the chain registry, not the session `walletAddress`.)

## Promotion criteria, status

Original gate, with current state:

- ✅ Promoted into live login + link; legacy MWA-only `solanaSignIn`/`solanaLinkWallet` retired.
- ✅ Server-nonce flow (`auth.ts`) + `adapter.authenticate(buildMessage)` across all transports.
- ✅ Single-source chain config; signatures pinned to server-registered CAIP-2 ids.
- ✅ Wallet-killed mid-flow surfaces a typed error / decline → `null` (no silent hang); unit-tested.
- ✅ EVM transport unblocked by the Reown/WalletConnect swap (#110–#112) after
  MM Connect signing proved unfixable on RN.
- ⬜ Device passes: EVM connect/sign/send on Android + iOS; iOS Phantom
  connect+sign+disconnect; p95 signMessage < 5s on a real network (formerly #68).
