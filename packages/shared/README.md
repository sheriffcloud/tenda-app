# @tenda/shared

Shared code consumed by the server, mobile app, and admin dashboard. Single
source of truth for types, database schema, API contracts, chain manifest,
contract artifacts, constants, and utilities.

## Structure

```
src/
  types/        TypeScript interfaces (User, Escrow, Gig, Review, Chat, ...)
  db/schema/    Drizzle ORM schema, split by domain (authoritative — migrate from here)
  api/
    contracts/  Typed endpoint definitions per resource
    routes.ts   All API route paths
  chains/       CHAIN_MANIFEST — public per-chain facts (ids, confirmations, tokens, gas policy)
  abi/          Generated TendaEscrow.sol ABI (source: contracts/evm — do not hand-edit)
  idl/          Generated Anchor IDL (source: contracts/solana — do not hand-edit)
  constants/    ErrorCode, ASSET_META, permissions, ...
  utils/        Pure helper functions (gig-utils, currency, ...)
```

## Usage

```ts
// Types + utilities
import type { Escrow, GigDetail, User } from '@tenda/shared'
import { amountRawToDisplay, hasPermission } from '@tenda/shared'

// DB schema (server only)
import { escrows, users, escrow_proofs } from '@tenda/shared/db/schema'
```

## Scripts

| Command | Description |
|---|---|
| `pnpm build` | Compile to `dist/` (+ copy ABI/IDL JSON) |
| `pnpm build:watch` | tsc watch mode |
| `pnpm test` / `pnpm test:coverage` | node:test suite |
| `pnpm type-check` | tsc (src) — `type-check:test` for the test tsconfig |

## Important

**Always rebuild after changes:**

```bash
pnpm --filter @tenda/shared build
```

The consumers resolve imports from `dist/` — stale output causes type
mismatches and runtime errors. The build does `rm -rf dist` first, so never
run it while another package's test suite is mid-run.

## Exports

| Path | Contents |
|---|---|
| `@tenda/shared` | Types, utilities, constants, API contracts, chain manifest |
| `@tenda/shared/db/schema` (+ `/db/schema/*`) | Drizzle table definitions |
| `@tenda/shared/abi` | Generated EVM contract ABI |
| `@tenda/shared/idl` | Generated Anchor IDL |
