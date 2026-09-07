# Tenda Escrow — EVM contract (`@tenda/contracts-evm`)

EVM mirror of the Tenda escrow primitive (stage-3-base.md). One contract,
`src/TendaEscrow.sol`, replicating the Solana Anchor program 1:1 — same
status machine (numbering matches the Anchor enum), deadlines, fee math,
dispute-bond flow and event vocabulary.

Deliberate divergences from the Anchor program (documented in NatSpec):
- `raisedBy` is recorded on-chain at dispute time, so `resolveDispute`
  takes no raiser argument (the Anchor program passes it as an attested
  instruction arg to keep account schema minimal).
- The dispute bond is collected from the raiser at `disputeEscrow` time —
  the stage-doc line suggesting `amount + disputeBond` at create is stale
  relative to both the Anchor program and the doc's own payable
  `disputeEscrow`.

## Commands

```bash
forge build          # via-IR + optimizer (see foundry.toml)
forge test           # 38 tests: lifecycle, guards, dispute matrix, ERC-20 +
                     # native, reentrancy, fee fuzz, 1-wei split edge cases —
                     # 100% line/branch/function coverage (--ir-minimum)
forge script script/Deploy.s.sol --rpc-url $BASE_RPC_URL --broadcast --verify
```

Deploy env: `TENDA_ADMIN` (Safe 3-of-5), `TENDA_DISPUTE_ADMIN`,
`TENDA_TREASURY` (+ optional fee/window overrides — defaults mirror the
Solana platform config).

Mainnet gate: paid audit (stage-3 § Smart contract). Deploy runbook:
`DEPLOY.md` (+ `docs/production_setup_guide.md` § 5).
