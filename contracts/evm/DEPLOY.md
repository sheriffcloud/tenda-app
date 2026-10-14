# TendaEscrow — EVM deploy runbook

One runbook for every EVM chain: the worked example below is BASE
(eip155:8453); § 8 covers per-chain deltas. Deployment records live in
`broadcast/Deploy.s.sol/<chainid>/` (commit-worthy — `run-latest.json` is the
current deployment, the timestamped siblings are the history).

> Always dress-rehearse on the chain's testnet first (e.g. Base Sepolia,
> eip155:84532): same steps, throwaway addresses, faucet gas.

---

## 0. Prerequisites (mainnet-gating external work)

A mainnet deploy cannot be trusted-for-production until these exist:

| Item | Produces | Needed for |
|---|---|---|
| **Safe 3-of-5 multisig** on the target chain | the Safe address | `TENDA_ADMIN` + `TENDA_TREASURY` (constructor) and `CHAIN_<ID>_TREASURY_ADDR` (server) |
| **Dispute-authority key** (ops key at launch, can migrate to its own Safe) | `TENDA_DISPUTE_ADMIN` | constructor |
| **RPC provider account** (e.g. Alchemy) | `CHAIN_<ID>_RPC_URL` (+ optional webhook secret) | server adapter (+ optional push event ingest, § 6) |
| **Solidity audit** | sign-off | mainnet only |
| **Deployer EOA** funded with the chain's gas token | `DEPLOYER_KEY` | broadcasting the deploy tx |
| **Explorer API key** — ONE key from [etherscan.io](https://etherscan.io/apis), not a per-chain one | `--etherscan-api-key` | source verification (§ 3.1) |

Gasless UserOps (paymaster) are **not** a prerequisite — that path is
currently on hold (EOA-as-4337-sender limitation), and without
`CHAIN_<ID>_PAYMASTER_URL` users simply pay their own gas.

---

## 1. Pre-flight (in `contracts/evm/`)

```bash
cd contracts/evm
forge build          # must compile (solc pinned in foundry.toml, via_ir)
forge test           # permit paths + invariant suite — see the warning below
forge fmt --check    # style gate
```

> ℹ️ **#113 is diagnosed, and it is the HARNESS, not `TendaEscrow`.** This note
> used to say `forge test` was "NOT green as of 2026-09-05: 127 pass, 4 fail …
> deterministic across fuzz seeds", that it was unresolved whether the fault lay
> in the handler or the contract, and therefore to "treat the invariant suite as
> guaranteeing NOTHING". Measured 2026-09-09, all three parts were wrong:
>
> - The fault is `test/invariant/TendaEscrowHandler.sol:312`,
>   `actors[(actorSeed + 1) % ACTOR_COUNT]`, which overflows in checked 0.8
>   arithmetic when the fuzzer picks `actorSeed = type(uint256).max`. That is a
>   panic in the handler's own arithmetic, before `TendaEscrow` is called.
>   `[invariant] fail_on_revert = true` in `foundry.toml` turns it into a suite
>   failure rather than a skipped call.
> - It is not deterministic. It LOOKED deterministic because foundry persists a
>   counterexample under `contracts/evm/cache/invariant/failures/` (gitignored)
>   and REPLAYS it first on every later run — so once found on a machine it
>   never goes away there. `rm -rf contracts/evm/cache/invariant/failures` and a
>   fresh run is **5 passed, 64 runs × 3072 calls each**, 131/131 for the whole
>   suite.
> - So the invariant suite is not guaranteeing nothing. Read a green run as
>   green. If you meet the panic, it is this seed and not a solvency break.
>
> Still worth fixing before the audit engagement (**#166**): bound the seed
> before the arithmetic. An auditor who runs the suite will hit it and reasonably
> read it as a contract failure.

---

## 2. Resolve the constructor inputs

The deploy script (`script/Deploy.s.sol`) reads these from the environment:

**Required (no defaults — deploy reverts on `address(0)`):**

| Env var | Value |
|---|---|
| `TENDA_ADMIN` | the Safe 3-of-5 address (protocol admin **and** the natural treasury owner) |
| `TENDA_DISPUTE_ADMIN` | separate dispute authority (ops key at launch) |
| `TENDA_TREASURY` | fee recipient — normally the same Safe as `TENDA_ADMIN` |

**Optional (the fee defaults mirror the Solana platform config — keep them
unless product says otherwise; the approval window has no off-chain
counterpart, see below):**

| Env var | Default | Meaning |
|---|---|---|
| `TENDA_FEE_BPS` | `250` | 2.50% platform fee |
| `TENDA_SEEKER_FEE_BPS` | `100` | 1.00% reduced seeker fee |
| `TENDA_APPROVAL_WINDOW_S` | `86400` | 24h poster review window |
| `TENDA_GRACE_PERIOD_S` | `3600` | 1h grace period |

> ⚠️ **The approval window is now a CONTRACT value and nothing else** (#148),
> which changed what this warning has to say. It used to read "off-chain
> `platform_config.approval_window_seconds` is still 172800, so this default
> reclaims a day earlier than the app advertises" — that premise is gone: #148
> DROPPED that column, and every surface now reads the window live off the
> contract, served as `approval_window_seconds` on each `ChainRegistryEntry`.
> There is no second number for a deploy to contradict, and #96 (tracked as a
> revert of the 24h value) is superseded by that.
>
> What remains true is that the value is per-deployment and the deployments
> already differ on purpose — Celo mainnet 24h, the testnets 48h. So decide it
> deliberately and pass `TENDA_APPROVAL_WINDOW_S` explicitly rather than taking
> `86400` by omission, and remember it is what a worker's claim right is
> measured against.

> These four are validated on-chain (`_validateFeeBps`, `_validateApprovalWindow`,
> `_validateGracePeriod`). They are also mutable post-deploy via the admin (Safe)
> setters, so getting them exactly right at deploy time is not critical.

**Token addresses (for step 5, not the constructor — the contract is
asset-agnostic):** stablecoin addresses are manifest constants in
`packages/shared/src/chains/manifest.ts`.

> ⚠️ Verify token addresses against the issuer's official docs (e.g. Circle's
> USDC address list) before adding a manifest entry — a wrong token address
> silently routes funds to the wrong contract.

---

## 3. Deploy

```bash
export TENDA_ADMIN=0x...           # Safe 3-of-5
export TENDA_DISPUTE_ADMIN=0x...   # ops key
export TENDA_TREASURY=0x...        # = Safe, usually
export DEPLOYER_KEY=0x...          # funded EOA private key (NOT a Safe)
export BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/<key>
export ETHERSCAN_API_KEY=...     # etherscan.io key — V2 covers every chain

forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$BASE_RPC_URL" \
  --broadcast \
  --private-key "$DEPLOYER_KEY" \
  --verify --watch \
  --verifier etherscan \
  --verifier-url "https://api.etherscan.io/v2/api?chainid=8453" \
  --etherscan-api-key "$ETHERSCAN_API_KEY"
```

> Every one of those four verify flags is load-bearing — see § 3.1. `--verify`
> ALONE silently verifies against Sourcify, not the explorer you expect.

The script logs `TendaEscrow deployed: 0x...` — **that address is
`CHAIN_<ID>_ESCROW_ADDR`** (for BASE: `CHAIN_EIP155_8453_ESCROW_ADDR`).
Foundry also writes `broadcast/Deploy.s.sol/<chainid>/run-latest.json`
(commit it) and, with `--verify`, the verified source on the explorer.

> The deployer EOA only constructs the contract; it holds **no** privileged role
> afterward. All authority sits with `TENDA_ADMIN` (the Safe) and
> `TENDA_DISPUTE_ADMIN`. There is nothing to renounce.

---

### 3.1 Source verification — three facts that make the naive command fail

All three MEASURED 2026-09-05 against forge 1.7.1. Verification is the step
most likely to fail silently, and a mainnet contract nobody can read is a
mainnet contract nobody will use.

**(a) `--verifier` defaults to `sourcify`, NOT etherscan.** `forge
verify-contract --help` prints `[default: sourcify]` — that flag default is the
measured part. It follows that `--verify --etherscan-api-key <key>` submits to
Sourcify and the key is inert; what was NOT measured is whether such a run
reports success or warns, so do not rely on its exit status to tell you.
Always pass `--verifier etherscan` explicitly.

**(b) The per-chain V1 explorer APIs are DEAD.** `api.celoscan.io/api` answers:

    "You are using a deprecated V1 endpoint, switch to Etherscan API V2"

Etherscan V2 replaced them with ONE endpoint and ONE key across 61 chains:
`https://api.etherscan.io/v2/api?chainid=<id>` — Celo (42220), Base (8453) and
Ethereum (1) are all `status: 1` in `https://api.etherscan.io/v2/chainlist`.
So there is no `BASESCAN_API_KEY` / `CELOSCAN_API_KEY` any more: get one key
from etherscan.io and change `chainid=` per chain.

**(c) Pass `--verifier-url` explicitly.** forge carries a built-in chain table
that may still resolve to the dead V1 host. Naming the V2 URL yourself costs
nothing and removes the guess.

#### Verifying after the fact

Verification is INDEPENDENT of the deploy and retryable forever — a failed
`--verify` never costs you the deployment, so never re-broadcast to fix it.

```bash
forge verify-contract "$ESCROW_ADDR" src/TendaEscrow.sol:TendaEscrow \
  --chain 42220 --watch \
  --verifier etherscan \
  --verifier-url "https://api.etherscan.io/v2/api?chainid=42220" \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  --constructor-args $(cast abi-encode \
    "constructor(address,address,address,uint16,uint16,uint64,uint64)" \
    "$TENDA_ADMIN" "$TENDA_DISPUTE_ADMIN" "$TENDA_TREASURY" \
    250 100 86400 3600)
```

The constructor args must be the values ACTUALLY deployed, not the defaults
copied from here — read them off the script's own log lines (`feeBps`,
`seekerFeeBps`, `approvalWndS`, `gracePeriodS`), or off
`broadcast/Deploy.s.sol/<chainid>/run-latest.json`. `--guess-constructor-args`
can recover them from the creation code if the log is lost.

#### No API key: Blockscout

Needs no key and is live for Celo (`celo.blockscout.com/api` → 200):

```bash
--verify --verifier blockscout --verifier-url "https://celo.blockscout.com/api/"
```

Sourcify (the default) also needs no key, but it publishes to sourcify.dev
rather than to the block explorer a judge or user will actually open.

#### Confirm it landed

Do not trust the run's own output — open the explorer, or:

```bash
curl -s "https://api.etherscan.io/v2/api?chainid=42220&module=contract\
&action=getsourcecode&address=$ESCROW_ADDR&apikey=$ETHERSCAN_API_KEY" \
  | python3 -c 'import json,sys; r=json.load(sys.stdin)["result"]; print(r if isinstance(r,str) else (r[0]["ContractName"] or "NOT VERIFIED"))'
```

---

## 4. Post-deploy sanity checks (read-only)

```bash
cast call $ESCROW_ADDR "admin()(address)"        --rpc-url $RPC_URL  # == Safe
cast call $ESCROW_ADDR "disputeAdmin()(address)" --rpc-url $RPC_URL
cast call $ESCROW_ADDR "treasury()(address)"     --rpc-url $RPC_URL
cast call $ESCROW_ADDR "feeBps()(uint16)"        --rpc-url $RPC_URL  # 250
```

---

### 4.1 Allow-list the permit relayer (only if the x402 relayer is live)

`createEscrowForWithPermit` refuses every caller the admin has not listed —
a permit binds an allowance, not the draft's terms, so only Tenda's relayer may
spend one (design: `docs/agent_escrow_funding_evm.md`). From the admin (Safe):

```bash
cast send $ESCROW_ADDR "setRelayer(address,bool)" $RELAYER_HOT_WALLET true --rpc-url $RPC_URL
cast call $ESCROW_ADDR "relayers(address)(bool)" $RELAYER_HOT_WALLET --rpc-url $RPC_URL   # → true
```

The EIP-3009 path (`createEscrowFor`) needs no listing — its nonce binds every
term, so anyone, including the signer, may relay it.

---

## 5. Wire the server (`apps/server/.env`)

Chain secrets are flat env vars keyed by CAIP-2 id — `CHAIN_<SANITISED_ID>_<FIELD>`,
loaded and validated by `apps/server/src/chains/secrets/`. Activation rule:
**none set → chain inactive (silently skipped); all required set → active;
some-but-not-all, or any malformed value → boot error naming the exact key.**
At most one chain per family may be active (BASE mainnet XOR Base Sepolia).

```dotenv
# required (all three, or partial-config boot error)
CHAIN_EIP155_8453_RPC_URL=https://base-mainnet.g.alchemy.com/v2/<key>
CHAIN_EIP155_8453_ESCROW_ADDR=0x...          # from step 3 deploy output
CHAIN_EIP155_8453_TREASURY_ADDR=0x...        # the Safe (treasury_address in the chain row)
# optional
CHAIN_EIP155_8453_ESCROW_DEPLOY_BLOCK=...    # exact listener start (recommended; from step 3 record)
CHAIN_EIP155_8453_DISPUTE_ADMIN_ADDR=0x...   # enables the admin-sign pre-flight check
CHAIN_EIP155_8453_RPC_URL_FALLBACK=https://... # secondary RPC, failover on primary errors
CHAIN_EIP155_8453_PAYMASTER_URL=https://...  # unset = no gasless UserOps (users pay gas)
CHAIN_EIP155_8453_WEBHOOK_SECRET=...         # HMAC key, only if using the § 6 webhook
CHAIN_EIP155_8453_RELAYER_KEY=0x...          # x402 relayer hot wallet (#18); unset = RELAY_UNAVAILABLE
```

**The relayer hot wallet (#18)** is a plain EOA that sends `createEscrowFor`
and pays its gas — a gas float, never escrow funds (the contract pulls those
from the creator by signature). Fund it with native gas on this chain, monitor
its balance like the Solana gas-seed wallet, and rotate by replacing the key
and re-funding; nothing on-chain references it on the EIP-3009 path. Design +
operations: `docs/agent_escrow_funding_relayer.md`.

Token addresses are **not** env vars — they are manifest constants
(`packages/shared/src/chains/manifest.ts`), seeded from there.

**EIP-2612 permit capability is also manifest config** — the asset's
`permit: { version }` entry (Circle FiatToken = version `"2"`). When set, the
server offers one-transaction `createEscrowWithPermit`/`disputeEscrowWithPermit`
funding; when absent, clients use the two-step approve flow. Before enabling it
for a new chain/token, verify the live token actually speaks EIP-2612 with the
declared domain:

```bash
cast call $USDC_ADDR "DOMAIN_SEPARATOR()(bytes32)" --rpc-url $RPC  # exists ⇒ EIP-2612-capable
cast call $USDC_ADDR "version()(string)"           --rpc-url $RPC  # must equal the manifest permit.version
```

(The domain `name` and per-owner `nonces` are read live by the server on every
permit-payload request — only the `version` is declared config.) The server
re-checks the domain at runtime on every permit-payload request; a mismatch
degrades to `PERMIT_UNAVAILABLE` and clients fall back to approve — so a wrong
manifest entry is a lost optimisation, never stuck funds.

Then seed the chain + asset registry rows:

```bash
cd apps/server
pnpm db:seed           # idempotent (src/db/seed-v2.ts); inserts the chain row + assets
```

Restart the server. On boot the registry mounts the chain's adapter.

---

## 6. Event ingestion

The `eth_getLogs` polling listener is the default event path and needs no
external service — its first run starts at `ESCROW_DEPLOY_BLOCK` (unset, it
falls back to a bounded recency window and warns at boot); the client-ping
(`POST /v1/blockchain/transaction`) + BullMQ verify-tx job is the per-tx pull
path. Optionally, on providers that support it (Alchemy), add a push webhook:

- Custom Webhook (or Address Activity) → `POST https://<server-host>/v1/webhooks/alchemy`
- Watch address: the deployed escrow (`CHAIN_<ID>_ESCROW_ADDR`).
- The signing key the provider generates is `CHAIN_<ID>_WEBHOOK_SECRET`; the
  route verifies the HMAC (`src/lib/http/verify-hmac.ts`) and drops
  unsigned/mismatched calls.

---

## 7. End-to-end smoke (testnet first)

1. Mobile: pick the chain in gig-create, fund a test wallet with the chain's
   testnet stablecoin + gas token.
2. Create → accept → submit → approve → claim a full escrow lifecycle.
3. Confirm each transition emits the expected event (`EscrowCreated`,
   `EscrowAccepted`, `ProofSubmitted`, `EscrowApproved`, `PaymentClaimed`) and that
   the server's verify-tx job + WS republish reflect it.
4. Confirm fee math: `treasury` receives `feeBps`/`seekerFeeBps` of principal.
5. Permit paths: create a gig with a permit-capable wallet (ONE wallet prompt —
   typed-data sign, no separate approve tx) and confirm the escrow funds; then
   check **Settings → Token approvals** shows no residual allowance. Repeat with
   a dispute bond (`disputeEscrowWithPermit`).

---

## 8. Per-chain deltas

Same flow for every EVM chain — swap the `CHAIN_<ID>_*` prefix and the
chain-specific addresses; gas handling comes from the manifest's `gasPolicy`:

- **CELO (eip155:42220):** gas paid in a stablecoin via `feeCurrency` on every
  tx (no paymaster, no UserOps, no `PAYMASTER_URL` — the fee-currency adapter
  address is a manifest constant, like the confirmation margin).
  Verifier URL: `https://api.etherscan.io/v2/api?chainid=42220` → celoscan.io.
  **Celo REJECTS the osaka `CLZ` opcode**, exactly like 0G — probed 2026-09-05
  with `cast call --create 0x60011e5060006000f3`: Celo answers `invalid opcode:
  CLZ` where Ethereum and Base both return `0x`. The default profile compiles to
  `evmVersion=osaka`, so this looks like it needs `FOUNDRY_PROFILE=0g`. **It does
  not** — measured at the same time: `TendaEscrow` emits no `CLZ`, and the osaka
  and cancun runtimes are byte-identical up to byte 13613 of 13656 (the tail is
  only the CBOR metadata hash, which differs because `evmVersion` is hashed into
  the metadata). So the default profile is safe HERE. Re-run the probe and the
  byte comparison if the contract source changes — a future `<<`/leading-zeros
  rewrite is exactly what would make solc emit `CLZ`.
- **New chains:** one manifest entry (id, RPC/explorer, gasPolicy, assets) +
  the env block in § 5 — no server code. Redeploys on an existing chain are
  one `CHAIN_<ID>_ESCROW_ADDR` change: `db:seed` appends the new contract to
  `chain_contracts`, and in-flight escrows keep transacting against the
  contract that holds their funds.

---

## Rollback / kill-switch

There is no contract-level pause. To take a chain offline operationally, unset
**all** its `CHAIN_<ID>_*` vars (a partial unset is a boot error) and restart
the server — the adapter stops registering and every escrow ACTION on that
chain fails closed with a 503 `SERVICE_UNAVAILABLE` (`lib/escrow/build-tx.ts`
checks `chains.has` and refuses there rather than letting the registry's raw
throw become a 500). Creating a new escrow is refused earlier still: the chain
is not in the registry the composer reads, and the create validator answers 422.
One gap to know about during an incident — resolving a DISPUTE resolves its
adapter without that guard (`lib/escrow/resolve-tx.ts`), so that one surfaces as
a 500 rather than a 503.

> ⚠️ **Two things this procedure will do that are easy to be surprised by, and
> the second one traps money.**
>
> 1. **On a deployment with `SEED_ON_BOOT=true` the boot REFUSES.** The seed
>    disables every chain outside the active config, and that refusal is
>    deliberate — see `ALLOW_CHAIN_DISABLE` in `apps/server/.env.example`. Set it
>    to the exact lowercase string `true` for the one deploy that retires the
>    chain, then put it back.
> 2. **Escrows on that chain stop being actionable.** With no adapter there is
>    nothing to build or verify a transaction with, so accept, submit, approve,
>    cancel, refund and dispute all fail while the listings still display. Funds
>    already escrowed remain claimable **directly on-chain** via the Safe, but
>    not through the app. A chain with no unsettled escrows retires cleanly;
>    one with them does not, so check before you unset.
