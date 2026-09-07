# chains/

Per-chain adapter registry. Each chain implements `ChainAdapter` (see
`types.ts`); the rest of the server routes by `escrow.chain_id` → adapter
without knowing which protocol is underneath.

Adapters are built **generically** from the active chain secrets against the
shared `CHAIN_MANIFEST` (see `secrets.ts` + `index.ts#buildAdapters`):
`namespace` picks the adapter (`solana/` vs `evm/`), `gasPolicy` picks the dep
wiring (paymaster / feeCurrency / plain), and confirmations + token addresses
come from the manifest. **Adding a chain is one manifest entry plus its
`CHAIN_<ID>_*` env secrets, no code change here.**

| Concern | Source |
|---|---|
| Which chains are active | `chains/secrets/` (`CHAIN_<ID>_*` env) |
| Public facts (ids, confirmations, token addresses, gasPolicy) | `@tenda/shared` `CHAIN_MANIFEST` |
| Adapter impls | `solana/*`, `evm/*` (one EVM adapter serves BASE + CELO + any L2) |
| Which contract holds a given escrow | `chains/contracts/` (`chain_contracts` + the escrow's stamp) |

## Contract generations (`contracts/`)

A chain's escrow contract is **current state**; the contracts it has ever run
are **history**. After a redeploy those differ, and the difference is load
bearing: an escrow funded before the swap still holds its money in the old
contract, so its transitions must keep going there. Building against
"whichever contract is current" produces a transaction the chain rejects, and
the funds become unreachable — that is open_issues #89.

- `chains.escrow_program` = current. `chain_contracts` = every generation.
- History records itself: `db:seed` appends the configured contract
  (`ON CONFLICT DO NOTHING`) on every boot, so a redeploy is still just the one
  `CHAIN_<ID>_ESCROW_ADDR` change.
- `resolveEscrowContract(escrow, registry)` picks the contract per ESCROW and
  refuses anything outside the known set. A `NULL` stamp resolves to the sole
  contract only while a chain has run exactly one; past that it refuses rather
  than guess.
- The EVM listener watches the whole set in one `eth_getLogs`, and receipts
  decode against the whole set — so an old-contract transaction still verifies
  instead of being recorded as a failure.

### Solana upgrades in place — a permanent non-goal

Solana has no second address to watch and must not acquire one. The program id
is `declare_id!`, propagated through the IDL (`ESCROW_IDL.address`), and every
PDA derives from it; `anchor upgrade` replaces the CODE while keeping the id.
Deploying a *new* program id on mainnet would strand every existing escrow's
PDAs, and no server-side registry can rescue that. `chains/solana/builders.ts`
therefore refuses outright when asked to build against any other program, and
the multi-address listener work is EVM-only by design.

Tests live under `apps/server/test/` (`unit/chains/secrets.test.ts`,
`unit/chain-registry.test.ts`) per `testing-strategy.md`.

## Why a separate folder, not `lib/chain.ts`

The plan calls for explicit per-chain isolation so a vendor outage on one
chain can't bleed into another's code path. Each chain's RPC clients, error
classification, builders, and listeners are self-contained; the only shared
surface is the interface defined in `types.ts`.
