# Tenda Escrow — EVM contract (`@tenda/contracts-evm`)

EVM mirror of the Tenda escrow primitive. One contract, `src/TendaEscrow.sol`,
replicating the Solana Anchor program 1:1 — same status machine (numbering
matches the Anchor enum), deadlines, fee math, dispute-bond flow and event
vocabulary. Serves every EVM chain Tenda runs on; deployed addresses are
server env config (`CHAIN_<ID>_ESCROW_ADDR`), not code.

Deliberate divergences from the Anchor program (documented in NatSpec):

- `raisedBy` is recorded on-chain at dispute time, so `resolveDispute` takes
  no raiser argument.
- The dispute bond is collected from the raiser at `disputeEscrow` time, not
  at create.
- Relayed creates (`createEscrowFor` via EIP-3009, `createEscrowForWithPermit`
  via EIP-2612, the latter admin-allow-listed through `setRelayer`) exist on the
  EVM side only: the Anchor program needs no counterpart because Solana
  separates the fee payer natively. Design and binding rules:
  `docs/agent_escrow_funding_evm.md` (repo docs).

## Commands

```bash
forge build          # solc 0.8.35, via-IR + optimizer (see foundry.toml)
forge test           # lifecycle, guards, dispute matrix, ERC-20 + native,
                     # permit paths, relayed creates (EIP-3009 / permit),
                     # reentrancy, fee fuzz, invariant suite
forge fmt --check
pnpm --dir ../.. sync:abi   # regenerate packages/shared/src/abi after src changes
```

## Deploy

Runbook: **`DEPLOY.md`**. Constructor
env: `TENDA_ADMIN`, `TENDA_DISPUTE_ADMIN`, `TENDA_TREASURY` (required) +
optional fee/window overrides — defaults mirror the Solana platform config.
Mainnet gate: paid audit.
