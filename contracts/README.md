# contracts/

The on-chain programs, in the monorepo so they version with the code that
consumes them.

| dir       | chain family | toolchain        | source of truth for           |
| --------- | ------------ | ---------------- | ----------------------------- |
| `evm/`    | EVM (Base/Celo) | Foundry (forge) | `packages/shared/src/abi/`    |
| `solana/` | Solana       | Anchor           | `packages/shared/src/idl/`    |

## The anti-drift contract

`packages/shared/src/{abi,idl}` are **generated artifacts**, not hand-written.
The contracts here are the single source of truth; the apps import the generated
copy. Two layers keep them from ever drifting — without anyone remembering to
run a script:

1. **CI (`/.github/workflows/contracts.yml`)** — rebuilds each contract from
   source, re-runs the sync, and `git diff --exit-code`s the artifact. A
   contract change with a stale ABI/IDL **cannot merge**. It also asserts the
   Solana program id is identical across `declare_id!`, `Anchor.toml`, and the
   IDL (`scripts/check-program-id.mjs`).
2. **Local pre-commit (`lefthook.yml`)** — when contract *source* changes, it
   regenerates and stages the artifact for you, so the diff is right before it
   reaches CI.

Determinism: the ABI is `solc` output (version pinned in `evm/foundry.toml`) and
the IDL is `anchor` output (0.32.1) — both reproducible from source, so the diff
gate reflects real drift, not toolchain noise.

## Working on a contract

```sh
# EVM
cd contracts/evm && forge build && forge test
pnpm sync:abi              # regenerate the shared ABI (+ rebuild @tenda/shared)

# Solana
cd contracts/solana && anchor build && pnpm test
pnpm sync:idl              # regenerate the shared IDL (+ rebuild @tenda/shared)
```

`sync:*` accept `--no-build` (used by CI/lefthook) to skip the `@tenda/shared`
rebuild and only refresh `src/{abi,idl}`.

## Out of scope for the artifact guard (deliberate)

- **Deploy keys are secrets, not in git.** The Solana program keypair
  (`tenda_escrow-keypair.json`) and any EVM deployer key live out-of-repo; they
  are gitignored and are **not** needed to build, test, or generate the
  ABI/IDL (the IDL address comes from `declare_id!`).
- **Deployed contract addresses are config, not artifacts.** The live
  per-chain escrow addresses are server env secrets (`CHAIN_<id>_ESCROW`),
  outside this guard. They are validated at runtime by the chain adapters, not
  here.
