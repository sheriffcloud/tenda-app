# Tenda Escrow — Solana program

Anchor program for Tenda's single-escrow primitive (gig **and** exchange
escrows), rewritten at Stage 0 to mirror the Solidity `TendaEscrow` surface
1:1. The legacy concepts (UserAccount, gas-subsidy airdrop, withdraw_earnings)
are gone.

Program id: `cU6Z67oRepxKfiaCUKTqHiXMWVifFdYpVG1QC4SR6Eb` — pinned identically
in `declare_id!`, `Anchor.toml`, and the shared IDL, and CI-enforced by
`scripts/check-program-id.mjs`.

## Quick start

```bash
anchor build                       # rust-toolchain.toml pins the compiler
pnpm test                          # litesvm in-process suite (tests/)
pnpm type-check                    # tsc over tests + tests-devnet + migrations
pnpm --dir ../.. sync:idl          # regenerate packages/shared/src/idl after src changes
anchor deploy --provider.cluster devnet    # FIRST deploy to a cluster only
anchor migrate                     # one-time platform init (migrations/deploy.ts)
```

To ship a change to a cluster that **already has** the program — devnet, and
eventually mainnet — use `anchor upgrade`, not `anchor deploy`. The upgrade is
signed by the upgrade authority; `anchor deploy` would instead create a second
program at whatever `target/deploy/tenda_escrow-keypair.json` holds, and since
`declare_id!` names the real one, every instruction on that copy reverts. The
verified sequence (IDL parity → `solana program extend` if the binary grew →
upgrade → byte-compare the chain → republish the on-chain IDL) is in
`docs/stage-10-gig-approval-mode.md` § The deploy.

`anchor migrate` runs `migrations/deploy.ts`: it calls `initialize_platform`
with `TENDA_ADMIN` / `TENDA_DISPUTE_ADMIN` / `TENDA_TREASURY`, and is idempotent
(skips when the PlatformState PDA exists).

All three are **required on every cluster** — the migration throws when any is
unset, mirroring `vm.envAddress` in `contracts/evm/script/Deploy.s.sol`. They are
deliberately not read from a `.env`: initialization runs once per cluster and
cannot be undone from here, so the authorities are stated at the point of use.
To keep the deploy wallet on devnet, pass it explicitly:

```bash
TENDA_ADMIN=$(solana address) \
TENDA_DISPUTE_ADMIN=<pubkey> \
TENDA_TREASURY=<pubkey> \
anchor migrate --provider.cluster devnet
```

Fees and windows keep their defaults (`TENDA_FEE_BPS` 250, `TENDA_SEEKER_FEE_BPS`
100, `TENDA_APPROVAL_WINDOW_S` 172800, `TENDA_GRACE_PERIOD_S` 3600) — the same
split the EVM script uses: authorities required, tunables defaulted.

## Instructions

Escrow-moving instructions come in `_sol` / `_spl` pairs (native SOL vs SPL
token custody); the state machine is identical.

| Instruction | Caller | Description |
|---|---|---|
| `initialize_platform` | payer (one-time) | Create PlatformState PDA: authorities, fees, windows |
| `set_fee_bps` | protocol_admin | Adjust platform + seeker fee bps (one call, both values) |
| `set_treasury` / `set_dispute_admin` / `set_protocol_admin` | protocol_admin | Rotate authorities |
| `set_approval_window` / `set_grace_period` | protocol_admin | Adjust timing windows |
| `create_escrow_sol` / `create_escrow_spl` | creator | Open + fund an escrow |
| `cancel_escrow_sol` / `cancel_escrow_spl` | creator | Cancel while still open |
| `refund_expired_sol` / `refund_expired_spl` | creator | Refund after the accept deadline passes |
| `accept_escrow` / `decline_assigned_escrow` | counterparty | Take, or decline an assigned, job |
| `submit_proof` | counterparty | Submit completion proof (32-byte hash) |
| `approve_completion_sol` / `_spl` | creator | Release payment (fee → treasury) |
| `claim_stalled_payment_sol` / `_spl` | counterparty | Auto-claim after the approval window lapses |
| `reclaim_abandoned_sol` / `_spl` | creator | Reclaim after the completion window + grace lapses |
| `dispute_escrow_sol` / `_spl` | either party | Raise a dispute (posts a bond) |
| `resolve_dispute_sol` / `_spl` | dispute_admin | Resolve, distributing funds + bond |
| `close_legacy_platform` | protocol_admin | One-off cleanup of the pre-rewrite account |

On mainnet `protocol_admin` is the Squads 3-of-5 vault (key ceremony pending —
see `docs/production_setup_guide.md` § 4.3); `dispute_admin` is a single ops key.

## Accounts

- **PlatformState** — singleton PDA (seed `"platform"`): authorities, fee bps,
  approval window, grace period, total volume.
- **Escrow** — one PDA per escrow: parties, asset, amount, status, deadlines,
  dispute bond.

## Anti-drift

`packages/shared/src/idl/` is generated from this program. lefthook regenerates
it on commit; CI (`.github/workflows/contracts.yml`) rebuilds, diffs the IDL,
type-checks this package (migrations included), and asserts program-id parity.
Enum order + limits are additionally guarded against the Solidity contract by
`scripts/check-contract-parity.mjs`.

The program keypair (`tenda_escrow-keypair.json`) is a **secret** — gitignored,
required only for deploys under the same program id. Keep it in a vault.

## Requirements

- Anchor 0.32.1 (avm)
- Rust per `rust-toolchain.toml`
- Solana CLI **v3.0.14** (Agave), installed from the versioned URL:

  ```sh
  sh -c "$(curl -sSfL https://release.anza.xyz/v3.0.14/install)"
  ```

  Pinned, not a floor. This CLI supplies `cargo-build-sbf`, which decides what
  the `.so` litesvm loads actually is, and the test suite holds litesvm at
  0.3.3. Installing from `/stable/install` currently yields Agave v4.x and
  builds a program this suite is not known to run — the same drift that broke
  CI. `.github/workflows/contracts.yml` pins and asserts the identical version;
  keep the two in step when bumping, and expect to bump litesvm alongside.

  Note the installer bakes the version into the script it serves, so setting
  `SOLANA_RELEASE` in your environment does nothing — the URL is the only knob.

## License

MIT
