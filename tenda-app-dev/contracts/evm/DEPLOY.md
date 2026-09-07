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
| **Explorer API key** (Basescan etc.) | `--etherscan-api-key` | source verification |

Gasless UserOps (paymaster) are **not** a prerequisite — that path is
currently on hold (EOA-as-4337-sender limitation), and without
`CHAIN_<ID>_PAYMASTER_URL` users simply pay their own gas.

---

## 1. Pre-flight (in `contracts/evm/`)

```bash
cd contracts/evm
forge build          # must compile (solc pinned in foundry.toml, via_ir)
forge test           # all tests green, incl. permit paths + invariant suite
forge fmt --check    # style gate
```

---

## 2. Resolve the constructor inputs

The deploy script (`script/Deploy.s.sol`) reads these from the environment:

**Required (no defaults — deploy reverts on `address(0)`):**

| Env var | Value |
|---|---|
| `TENDA_ADMIN` | the Safe 3-of-5 address (protocol admin **and** the natural treasury owner) |
| `TENDA_DISPUTE_ADMIN` | separate dispute authority (ops key at launch) |
| `TENDA_TREASURY` | fee recipient — normally the same Safe as `TENDA_ADMIN` |

**Optional (defaults mirror the Solana platform config — keep them unless product says otherwise):**

| Env var | Default | Meaning |
|---|---|---|
| `TENDA_FEE_BPS` | `250` | 2.50% platform fee |
| `TENDA_SEEKER_FEE_BPS` | `100` | 1.00% reduced seeker fee |
| `TENDA_APPROVAL_WINDOW_S` | `172800` | 48h poster review window |
| `TENDA_GRACE_PERIOD_S` | `3600` | 1h grace period |

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
export BASESCAN_API_KEY=...

forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$BASE_RPC_URL" \
  --broadcast \
  --verify --etherscan-api-key "$BASESCAN_API_KEY" \
  --private-key "$DEPLOYER_KEY"
```

The script logs `TendaEscrow deployed: 0x...` — **that address is
`CHAIN_<ID>_ESCROW_ADDR`** (for BASE: `CHAIN_EIP155_8453_ESCROW_ADDR`).
Foundry also writes `broadcast/Deploy.s.sol/<chainid>/run-latest.json`
(commit it) and, with `--verify`, the verified source on the explorer.

> The deployer EOA only constructs the contract; it holds **no** privileged role
> afterward. All authority sits with `TENDA_ADMIN` (the Safe) and
> `TENDA_DISPUTE_ADMIN`. There is nothing to renounce.

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
  route verifies the HMAC (`src/core/webhooks/verify-hmac.ts`) and drops
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
- **New chains:** one manifest entry (id, RPC/explorer, gasPolicy, assets) +
  the env block in § 5 — no server code. Redeploys on an existing chain are
  one `CHAIN_<ID>_ESCROW_ADDR` change: `db:seed` appends the new contract to
  `chain_contracts`, and in-flight escrows keep transacting against the
  contract that holds their funds.

---

## Rollback / kill-switch

There is no contract-level pause. To take a chain offline operationally, unset
**all** its `CHAIN_<ID>_*` vars (a partial unset is a boot error) and restart
the server — the adapter stops registering and requests for that chain fail
closed with `no adapter registered for chain_id '<id>'`. Funds already in
escrows remain claimable directly on-chain via the Safe.
