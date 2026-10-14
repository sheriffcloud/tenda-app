/**
 * Chain manifest — the SINGLE source of truth for every public, deployment-
 * independent fact about a supported chain. Imported by the server (registry,
 * seeder, sponsor, webhooks) and mobile (asset/chain metadata, the AppKit EVM
 * network list, and the wallet's per-namespace chain id). Adding a chain in an
 * already-supported namespace (any Solana cluster, any EVM L2) is ONE entry here
 * plus its per-deployment secrets — no other code changes, on the server OR in
 * the mobile app. (A brand-new native gas token still needs its one ASSET_META
 * row — display data, keyed by asset id.) Every EVM entry MUST carry both
 * `publicRpcUrl` and `explorerUrl`, the public facts the mobile network needs.
 *
 * Split of responsibilities (everything that is NOT here):
 *   - SECRETS / endpoints (RPC URL, deployed contract/treasury addresses,
 *     webhook secrets) are per-deployment → flat env vars, loaded by the
 *     server's `chains/secrets.ts`. The manifest carries none of them.
 *   - Asset DISPLAY metadata (symbol/decimals/is_stable) stays in ASSET_META,
 *     keyed by asset id; the manifest references asset ids and never restates it.
 *
 * Three orthogonal fields, each with one job (do not conflate):
 *   - `namespace` → which adapter runs it AND which secret schema it reads.
 *   - `gasPolicy` → how gas is covered (drives the registry's dep wiring).
 *   - `family`    → network group; a deployment runs at most ONE chain per
 *                   family (Base mainnet XOR Base Sepolia), enforced by the
 *                   secret loader. This also prevents the global `assets.id`
 *                   PK (e.g. `USDC_BASE`) colliding across two active networks.
 */

import type { ChainNamespace } from '../db/schema/chains'
import { getAssetMeta } from '../constants/assets'
import { isEvmAddress, isEvmChainId } from '../utils/address'

/** How gas is paid on a chain — selects the registry's per-chain dep wiring. */
export type GasPolicy =
  | 'native-seed' // Solana: a one-time native-SOL grant on first wallet link.
  | 'paymaster' //   BASE-style: ERC-4337 paymaster sponsors the first txs.
  | 'feeCurrency' // CELO-style: gas paid in a stable via EIP-2930 feeCurrency.
  | 'none' //        User pays gas in the native token; no abstraction.

/**
 * What an asset may be used for. An asset can serve more than one role — USDC
 * is both gig-eligible (the stablecoin gig policy) AND exchange-tradable, so
 * `roles` is a set, not a single value. Native gas tokens are `token: null`.
 */
export const ASSET_ROLES = ['gig', 'exchange'] as const
export type AssetRole = (typeof ASSET_ROLES)[number]

/**
 * One asset on a chain. `token` is the on-chain contract/mint, or `null` for
 * the native gas token. `fromSecret` names a per-deployment secret key that
 * supplies the address instead (Solana's USDC mint differs per cluster and is
 * not canonical on devnet, so it can't be a manifest constant) — when set, the
 * asset is seeded only if that secret is configured. An asset is the chain's
 * NATIVE token iff `token === null && fromSecret === undefined`.
 */
export interface ChainAsset {
  /** Asset-registry id; MUST exist in ASSET_META. */
  id: string
  /** Non-empty set of roles this asset serves on the chain (see AssetRole). */
  roles: AssetRole[]
  token: string | null
  fromSecret?: string
  /**
   * EIP-2612 permit support — the token's EIP-712 domain `version` string,
   * verified against the LIVE token (its `version()` getter plus a
   * DOMAIN_SEPARATOR recomputation) before being recorded here. Present =
   * the escrow's *WithPermit entry points may be used for this asset;
   * absent = approve-flow fallback (cUSD's domain is non-standard —
   * verified on-chain 2026-07-03 — so it deliberately has NO entry).
   * ERC-20 assets with a canonical manifest token only.
   */
  permit?: { version: string }
  /**
   * EIP-3009 support — the token implements `receiveWithAuthorization` under
   * the SAME EIP-712 domain as its permit (FiatTokenV2 and its bridged/mock
   * derivatives do), which is what lets an agent fund an escrow by signature
   * with Tenda's relayer paying the gas (createEscrowFor, #17/#18). Requires
   * `permit` (the domain version it reuses); the server additionally probes
   * the live token for RECEIVE_WITH_AUTHORIZATION_TYPEHASH before quoting, so
   * a declaration ahead of a redeploy degrades to RELAY_UNSUPPORTED_ASSET rather
   * than to unusable signatures.
   */
  eip3009?: true
  /**
   * The token is a repo MOCK whose `mint()` is open — callable by anyone, no
   * faucet needed (#139). TESTNET GIG ASSETS ONLY, and the validator holds the
   * pair: a testnet's gig asset either has a chain `faucetUrl` or is declared
   * here, never neither, so the registry's "null faucet on a testnet means an
   * open mint" sentence is true by construction rather than by memory.
   */
  openMint?: true
}

/**
 * Whether Tenda's own escrow contract is DEPLOYED on a chain.
 *
 * Deliberately NOT derived from `kind`. `kind` answers "is this chain a
 * mainnet?" — a fact about the chain. This answers "do we settle here?" — a
 * fact about Tenda, and the two move independently. That inference is the bug
 * this field exists to remove: the landing read `kind === 'mainnet'` as "we run
 * there" and advertised four mainnet chains, none of which had a contract.
 *
 * THREE states, because two collapsed a distinction that matters:
 *
 * - 'live'      a CONFIRMED deployment — a broadcast transaction with a
 *               receipt, or a program id declared for that cluster. A simulated
 *               `forge script` run is not a deployment: Celo mainnet has three
 *               such runs on disk, every one with a null tx hash and no
 *               receipt.
 * - 'launching' the deploy is committed and next, but not on-chain yet. Exactly
 *               one chain should normally hold this.
 * - 'planned'   intended, unscheduled. No date, no commitment.
 *
 * The split between the last two is not cosmetic. With one bucket the landing
 * said "mainnet launching on 0G, Solana, Base and Celo" — four imminent
 * launches announced when only 0G was being deployed, which is the original
 * over-claim rebuilt one level down. A launch is a schedule claim and only
 * belongs on the chain actually being shipped to.
 *
 * Do not re-derive any of this from `kind` or from list ORDER. The landing
 * already knows 0G leads (LANDING_FAMILY_ORDER, launch positioning); position
 * in a list is not the same claim as a committed deploy, and reading one off
 * the other is how the first version of this bug happened.
 */
export type ChainStatus = 'live' | 'launching' | 'planned'

/**
 * Whether a chain is a real network or a test one — a fact about the CHAIN
 * (see `status` above for the fact about Tenda). Published on the registry
 * entry (#139) because a reader on a mainnet deployment could not otherwise
 * tell a null `faucet_url` that means "real money" from one that means "the
 * token's mint() is open".
 */
export const CHAIN_KINDS = ['mainnet', 'testnet'] as const
export type ChainKind = (typeof CHAIN_KINDS)[number]

export interface ChainManifestEntry {
  /** CAIP-2 id, e.g. `'eip155:8453'`, `'solana:devnet'`. */
  id: string
  namespace: ChainNamespace
  /** Network group; one active chain per family per deployment. */
  family: string
  kind: ChainKind
  /** Whether Tenda's escrow is deployed here — see ChainStatus. */
  status: ChainStatus
  displayName: string
  /** Reorg-safety margin before a receipt counts as confirmed. */
  minConfirmations: number
  /**
   * Public, client-safe JSON-RPC endpoint — used for read-only client calls
   * (the mobile wallet screen's balance reads) and the AppKit connector.
   * Required for EVM chains (validated below); Solana clients derive their RPC
   * from `clusterApiUrl`. This is NOT the server's RPC: the deployment's private
   * / keyed endpoint stays a secret (`CHAIN_<id>_RPC_URL`, secrets.ts), so
   * metered backend traffic never leaks to clients.
   */
  publicRpcUrl?: string
  /**
   * Block-explorer base URL (e.g. `https://basescan.org`) — the public fact the
   * mobile AppKit network definition needs for its `blockExplorers` entry.
   * Required for EVM chains (validated below); Solana links, when needed, are
   * derived elsewhere so no explorer is recorded here for Solana clusters.
   */
  explorerUrl?: string
  /**
   * Where a developer obtains this chain's test USDC (#137). TESTNETS ONLY —
   * validated below, because a faucet on a mainnet entry is a claim that
   * cannot be true. Absent on a testnet means there is no public faucet for
   * the gig token: 0G Galileo runs the repo's mock with an open `mint()`.
   * VERIFIED 2026-09-07 against faucet.circle.com's network list: Base
   * Sepolia, Celo Sepolia and Solana Devnet are offered; 0G is not.
   */
  faucetUrl?: string
  gasPolicy: GasPolicy
  /**
   * Asset id whose token funds gas, for `gasPolicy: 'feeCurrency'`. Required iff
   * the policy is feeCurrency. The gas-paying ADDRESS resolves via
   * `feeCurrencyAddress()`: an 18-decimal Mento stable (cUSD) is its own gas
   * adapter, so the asset's `token` is used directly; a non-18-decimal token
   * (USDC, 6 decimals) instead needs `feeCurrencyAdapter` below.
   */
  feeCurrency?: string
  /**
   * Celo FeeCurrencyDirectory ADAPTER address for a `feeCurrency` whose token is
   * NOT a native 18-decimal stable. The adapter presents the 18-decimal gas
   * interface over the underlying token, so the tx's `feeCurrency` field must
   * carry THIS address, not the token's (paying gas with the 6-decimal USDC
   * address directly is rejected by the node). Resolved on-chain from the
   * directory (each adapter's `adaptedToken()` == the fee token). Absent = the
   * fee token is its own adapter (cUSD). Only meaningful with `feeCurrency` set.
   */
  feeCurrencyAdapter?: string
  /**
   * One-time native-gas seed, in the chain's native base units (lamports for
   * Solana), granted to a new user's first wallet on this chain. Only meaningful
   * with `gasPolicy: 'native-seed'`; absent = the seed stays dormant (the DB's
   * gas_seed columns remain NULL and the claim surface offers nothing). The
   * FUNDING wallet is not recorded here — it's derived from the deployment's hot
   * wallet secret (`CHAIN_<id>_GAS_SEED_KEY`) at seed time, so the two can't drift.
   */
  gasSeedAmountRaw?: string
  /**
   * Switched off by decision, with no code removed. ORTHOGONAL to `status`:
   * status says whether Tenda's escrow is deployed here, and a deployed chain
   * that is paused is still deployed, so the two stay separate facts. A paused
   * chain stays KNOWN (an escrow already on it must keep resolving, settling
   * and being listened to) and refuses only new work: see `isChainEnabled` and
   * `isBlockedByChainPause`. Anything that asks "can users use this chain?"
   * goes through `isChainEnabled`, never a bare `entry.status === 'live'`.
   * Re-enabling a chain is deleting this one line. Only `true` is meaningful.
   */
  paused?: true
  assets: ChainAsset[]
}

/**
 * The supported chains. Token addresses are canonical, publicly published
 * contracts (verifiable on-chain); Solana USDC mints come from secrets
 * (`fromSecret: 'usdcMint'`) because the devnet faucet mint is not canonical.
 */
export const CHAIN_MANIFEST: readonly ChainManifestEntry[] = [
  {
    id: 'solana:mainnet',
    namespace: 'solana',
    family: 'solana',
    kind: 'mainnet',
    status: 'planned',
    displayName: 'Solana',
    minConfirmations: 1,
    gasPolicy: 'native-seed',
    // 0.007 SOL: covers one full escrow lifecycle for a 0-SOL user — escrow PDA
    // (0.00238728) + vault token account (0.00203928) + a payout USDC ATA
    // (0.00203928) rent, plus signature fees + headroom. Most is recoverable
    // rent (accounts close back to the creator); phone-gated + one grant per
    // user (gas_grants PK) bound the sybil surface.
    gasSeedAmountRaw: '7000000',
    assets: [
      { id: 'SOL', roles: ['exchange'], token: null },
      { id: 'USDC_SOL', roles: ['gig', 'exchange'], token: null, fromSecret: 'usdcMint' },
    ],
  },
  {
    id: 'solana:devnet',
    namespace: 'solana',
    family: 'solana',
    kind: 'testnet',
    status: 'live',
    displayName: 'Solana Devnet',
    minConfirmations: 1,
    faucetUrl: 'https://faucet.circle.com',
    gasPolicy: 'native-seed',
    // Same lamport cost as mainnet (rent is a protocol constant); devnet SOL is
    // free, so the value only matters for a representative smoke test here.
    gasSeedAmountRaw: '7000000',
    assets: [
      { id: 'SOL_DEVNET', roles: ['exchange'], token: null },
      { id: 'USDC_SOL', roles: ['gig', 'exchange'], token: null, fromSecret: 'usdcMint' },
    ],
  },
  {
    id: 'eip155:8453',
    namespace: 'eip155',
    family: 'base',
    kind: 'mainnet',
    status: 'planned',
    displayName: 'BASE',
    // PAUSED, NOT REMOVED (decision 2026-10-02): the strategy is Solana, 0G and
    // Arc. Base takes no new work (no escrow, accept, assignment, apply, or gas
    // seed) and appears on no user-facing list, but stays KNOWN so an escrow
    // already on it resolves, settles and is listened to. The ERC-4337 paymaster,
    // the ABIs and contracts/evm are kept. TO RE-ENABLE: delete this one line.
    paused: true,
    // OP-stack L2 with a single sequencer: sub-sequencer reorgs are rare, so 2
    // keeps near-instant UX while retaining a small reorg margin for real
    // funds. reconcile re-verifies state regardless. (Was 5 — over-conservative
    // for an L2, cost ~10s to reflect on-chain actions in the UI.)
    minConfirmations: 2,
    publicRpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    gasPolicy: 'paymaster',
    assets: [
      // Circle USDC on BASE (verified in repo: apps/server/.env.example).
      // permit version read from the live token's version() on 2026-07-03.
      {
        id: 'USDC_BASE',
        roles: ['gig', 'exchange'],
        token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        permit: { version: '2' },
        eip3009: true,
      },
      { id: 'ETH_BASE', roles: ['exchange'], token: null },
    ],
  },
  {
    id: 'eip155:84532',
    namespace: 'eip155',
    family: 'base',
    kind: 'testnet',
    status: 'live',
    displayName: 'Base Sepolia',
    // PAUSED, NOT REMOVED (decision 2026-10-02): the strategy is Solana, 0G and
    // Arc. Base takes no new work (no escrow, accept, assignment, apply, or gas
    // seed) and appears on no user-facing list, but stays KNOWN so an escrow
    // already on it resolves, settles and is listened to. The ERC-4337 paymaster,
    // the ABIs and contracts/evm are kept. TO RE-ENABLE: delete this one line.
    paused: true,
    // Testnet: confirm at the first block (~Solana-instant UX for dev/device
    // smoke). Mainnet keeps a 2-block margin.
    minConfirmations: 1,
    publicRpcUrl: 'https://sepolia.base.org',
    explorerUrl: 'https://sepolia.basescan.org',
    faucetUrl: 'https://faucet.circle.com',
    gasPolicy: 'paymaster',
    assets: [
      // Circle USDC on Base Sepolia — confirmed live (dress-rehearsal #124);
      // permit version() + DOMAIN_SEPARATOR verified on-chain 2026-07-03.
      {
        id: 'USDC_BASE',
        roles: ['gig', 'exchange'],
        token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        permit: { version: '2' },
        eip3009: true,
      },
      { id: 'ETH_BASE', roles: ['exchange'], token: null },
    ],
  },
  {
    id: 'eip155:42220',
    namespace: 'eip155',
    family: 'celo',
    kind: 'mainnet',
    // LIVE 2026-09-06. TendaEscrow 0x9D0193f7B607A15079bFE29aE28D69044F62c391,
    // tx 0x2aa4a7db7b1f70ba39fedf05ede5fb49a9e312d8571a4deaa4c5ef18bfb27241,
    // block 76748260, receipt status 0x1 — a broadcast transaction WITH a
    // receipt, which is what this field means. Verified on Celoscan as an exact
    // match, and the on-chain runtime was compared byte for byte against the
    // local build. The three null-hash `forge script` simulations the ChainStatus
    // docblock warns about are the ones on disk before this; the real broadcast
    // replaced run-latest.json.
    status: 'live',
    displayName: 'CELO',
    minConfirmations: 3,
    publicRpcUrl: 'https://forno.celo.org',
    explorerUrl: 'https://celoscan.io',
    gasPolicy: 'feeCurrency',
    // Gas paid in USDC (seamless onboarding: the same stablecoin users transact
    // in also covers gas — no separate gas token to hold). USDC is 6-decimal, so
    // the tx carries the FeeCurrencyDirectory ADAPTER (verified on-chain
    // 2026-07-13: directory 0x15F3…6276, adapter.adaptedToken() == the USDC
    // token), NOT the token address.
    feeCurrency: 'USDC_CELO',
    feeCurrencyAdapter: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
    assets: [
      // Verified in repo: apps/server/src/chains/celo/config.ts.
      // USDC permit version read from the live token 2026-07-03; cUSD has a
      // NON-standard EIP-712 domain (rename to 'Mento Dollar' + custom
      // fields, verified on-chain) — approve flow only, no permit entry.
      {
        id: 'USDC_CELO',
        roles: ['gig', 'exchange'],
        token: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
        permit: { version: '2' },
        eip3009: true,
      },
      // cNGN, the regulated naira stablecoin — EXCHANGE ONLY, deliberately.
      // `gigAssetByChain` returns the FIRST asset carrying the 'gig' role, so a
      // gig role here would be decided by ARRAY POSITION and nothing else:
      // below USDC_CELO it is dead config that reads as a shipped capability,
      // above it every Celo gig is silently denominated in naira. Neither is a
      // choice anyone made. Gig eligibility needs the composer and the wire to
      // carry a CHOSEN asset first (see the tracker); exchange has no such
      // constraint, because `exchangeAssetsByChain` returns the whole set.
      //
      // NOT A VANILLA ERC-20, and that is a fact about escrowed money rather
      // than a footnote. READ FROM THE LIVE TOKEN 2026-09-06: no
      // `DOMAIN_SEPARATOR`, no `nonces`, no `PERMIT_TYPEHASH` (so no EIP-2612 —
      // every post takes the plain approve path, which is TWO transactions),
      // and no EIP-3009 typehashes (so an agent cannot fund by signature and
      // the relayer cannot pay its gas). Declared with neither `permit` nor
      // `eip3009` so the builders take the approve path; the manifest's own
      // guard refuses `eip3009` without `permit`, so a wrong entry cannot load.
      //
      // The ISSUER RETAINS POWERS OVER ESCROWED BALANCES that USDC's issuer
      // does not, read from the verified implementation `Cngn3` behind its
      // EIP-1967 proxy: `pause` stops every transfer including a payout;
      // `destroyBlackFunds` burns a blacklisted address's balance; and
      // `transfer`/`transferFrom` revert outright if EITHER party is
      // blacklisted — the escrow contract is a party to both legs, so a
      // blacklisting there strands funds already locked. Sharpest of the four:
      // both entry points carry a REDEMPTION branch that runs `_burn(to)`
      // straight after the transfer when the recipient is a whitelisted
      // internal user and the sender a whitelisted external one, so a token
      // "received" can be destroyed on arrival while the escrow records the
      // full amount (`_collect` trusts `params.amount`; it does not measure
      // the balance delta). That branch needs BOTH parties whitelisted by the
      // issuer, i.e. a redemption arrangement Tenda has never entered into —
      // which is the honest limit of what is known, because the token does NOT
      // expose its adminOperationsContract (no public getter; not in the first
      // 13 proxy slots), so the whitelist itself cannot be read from outside.
      //
      // DECIDED 2026-09-08 (#114, user): cNGN is EXCHANGE-ONLY BY DESIGN, not
      // until something is built. A token whose issuer can pause, blacklist or
      // burn an escrowed balance is not escrow money, and it exists on Celo
      // alone. One gig asset per chain is therefore the rule (the manifest
      // test holds it), not a limitation of the composer or the wire.
      { id: 'cNGN', roles: ['exchange'], token: '0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f' },
      { id: 'cUSD', roles: ['exchange'], token: '0x765DE816845861e75A25fCA122bb6898B8B1282a' },
      { id: 'CELO', roles: ['exchange'], token: null },
    ],
  },
  {
    id: 'eip155:11142220',
    namespace: 'eip155',
    family: 'celo',
    kind: 'testnet',
    status: 'live',
    displayName: 'Celo Sepolia',
    minConfirmations: 3,
    publicRpcUrl: 'https://forno.celo-sepolia.celo-testnet.org',
    explorerUrl: 'https://sepolia.celoscan.io',
    faucetUrl: 'https://faucet.circle.com',
    gasPolicy: 'feeCurrency',
    // Same USDC-gas model as mainnet. Adapter resolved + verified on-chain
    // 2026-07-13 (chainId 11142220, directory 0x9212…11BF,
    // adapter.adaptedToken() == the USDC token below).
    feeCurrency: 'USDC_CELO',
    feeCurrencyAdapter: '0xbf1441Ea57f43f35f713431001f35742c88071c7',
    assets: [
      // Circle USDC on Celo Sepolia. permit version() read from the live token
      // on-chain 2026-07-13 → '2' (standard FiatTokenV2).
      {
        id: 'USDC_CELO',
        roles: ['gig', 'exchange'],
        token: '0x01C5C0122039549AD1493B8220cABEdD739BC44E',
        permit: { version: '2' },
        eip3009: true,
      },
      // cNGN's own Celo TESTNET deployment — the same token family as mainnet,
      // shape re-read here 2026-09-06 rather than inferred from it (chainId
      // 0xaa044c, symbol 'cNGN', decimals 6, `paused()` present,
      // `DOMAIN_SEPARATOR`/`nonces` absent). Its existence is why cNGN's first
      // transaction does not have to be on real money: the tracker recorded
      // "no Celo Sepolia deployment", and that was wrong.
      { id: 'cNGN', roles: ['exchange'], token: '0xa188439ccCEe9A6aa0E842f9c17C1b00C7B4dd4D' },
      { id: 'CELO', roles: ['exchange'], token: null },
    ],
  },
  {
    // Chain id verified 2026-08-27 via `cast chain-id` against the RPC
    // (chainlists disagreed across Galileo resets — 16600/16601/16602).
    id: 'eip155:16602',
    namespace: 'eip155',
    family: '0g',
    kind: 'testnet',
    status: 'live',
    displayName: '0G Galileo',
    // Testnet: confirm at the first block (~instant UX for dev/device smoke),
    // like Base Sepolia. Mainnet keeps a 2-block margin.
    minConfirmations: 1,
    publicRpcUrl: 'https://evmrpc-testnet.0g.ai',
    explorerUrl: 'https://chainscan-galileo.0g.ai',
    /*
     * 'native-seed' since #53b, and this is the chain the rail is PROVEN on.
     *
     * 0G mainnet declares the same policy but cannot be configured until an
     * escrow is deployed there (#13) — `SECRET_SCHEMA.eip155` requires
     * ESCROW_ADDR — so Galileo is where a funded hot wallet, a real transfer
     * and the verify script are exercised end to end. Testnet gas costs us
     * nothing and the landing card stays `unbuilt` either way, so nothing is
     * over-claimed by seeding here.
     */
    gasPolicy: 'native-seed',
    /*
     * MEASURED, not chosen: the worst-side user lifecycle on real TendaEscrow
     * bytecode × an observed Galileo gas price × a 3-lifecycle multiple. The
     * price and the multiple live in manifest-queries.ts
     * (OBSERVED_GAS_PRICE_WEI, GAS_SEED_LIFECYCLE_MULTIPLE) with their
     * provenance, and evm-gas-budget.anvil.test.ts fails if this number stops
     * covering the lifecycle.
     */
    gasSeedAmountRaw: '10000000000000000',
    assets: [
      // No canonical Circle USDC exists on 0G, so Galileo runs the repo's own
      // MockUSDCPermitV2 (contracts/evm/test/mocks): 6 decimals, EIP-712 domain
      // USDC / version "2" — DOMAIN_SEPARATOR recomputation verified on-chain —
      // with an open mint() for smoke funding. REDEPLOYED 2026-08-28 (the #17
      // build with receiveWithAuthorization; RECEIVE_WITH_AUTHORIZATION_TYPEHASH
      // verified on-chain = the canonical FiatTokenV2 constant), replacing
      // 0xcBFf…5e04 (2026-08-27, pre-EIP-3009) — relayed funding (#18) works here.
      {
        id: 'USDC_0G',
        roles: ['gig', 'exchange'],
        token: '0x3780460189622E60cB7ec6e8e97038A386674B71',
        permit: { version: '2' },
        eip3009: true,
        openMint: true,
      },
      { id: 'OG', roles: ['exchange'], token: null },
    ],
  },
  {
    // Chain id verified 2026-08-27 via `cast chain-id` against the RPC.
    id: 'eip155:16661',
    namespace: 'eip155',
    family: '0g',
    kind: 'mainnet',
    status: 'live',
    displayName: '0G',
    // Fast-final chain; mirror BASE's small reorg margin.
    minConfirmations: 2,
    publicRpcUrl: 'https://evmrpc.0g.ai',
    explorerUrl: 'https://chainscan.0g.ai',
    gasPolicy: 'native-seed',
    /*
     * MEASURED for the LIFECYCLE, INHERITED for the price — and the difference
     * matters, so it is stated rather than implied.
     *
     * The gas UNITS behind this number are real: evm-gas-budget.anvil.test.ts
     * runs the user-signed lifecycle against the same TendaEscrow bytecode this
     * chain will run and sums the receipts. The PRICE was Galileo's, carried
     * across, until 0G MAINNET's own was measured on 2026-09-08 (#77):
     * eth_gasPrice on https://evmrpc.0g.ai answered 3892412684 wei (~3.9 gwei),
     * identical across three reads — BELOW Galileo's 4.0 — and it is listed in
     * `OBSERVED_GAS_PRICE_WEI` at the same rounded-up 5 gwei, so this amount is
     * justified on mainnet too. Re-observe and let the budget test re-derive
     * it if the chain's pricing ever changes.
     *
     * Inert on a deployment that holds no ESCROW_ADDR for this chain:
     * SECRET_SCHEMA.eip155 requires it, so the chain cannot be configured,
     * `db:seed` leaves both gas columns NULL, and every seed path skips it.
     */
    gasSeedAmountRaw: '10000000000000000',
    assets: [
      // USDC.e — XSwap Bridged USDC (Chainlink CCIP; XSwap is 0G's official
      // bridge), built on Circle's Bridged USDC Standard. Verified on-chain
      // 2026-08-27: 6 decimals, version() "2", DOMAIN_SEPARATOR recomputes
      // with name "Bridged USDC" / "2" / 16661 / this address (the server
      // reads name() live, so the differing domain NAME just works), and
      // EIP-3009 present (RECEIVE_WITH_AUTHORIZATION_TYPEHASH responds) —
      // agent-funding (option B) capable, unlike the Galileo mock.
      //
      // NATIVE-USDC MIGRATION, when Circle arrives on 0G — two shapes:
      //  1. In-place upgrade (the Bridged USDC Standard's purpose): SAME
      //     address, so nothing here changes; if the EIP-712 domain name
      //     changes ("Bridged USDC" → "USDC"), the server's live name() read
      //     self-adjusts and permit keeps working. Re-verify version() == the
      //     permit declaration below after the upgrade.
      //  2. New address (separate native launch): swap `token` here + re-run
      //     the live domain checks — new ESCROWS then fund in native USDC,
      //     while in-flight escrows hold and settle the old token recorded in
      //     their on-chain escrow (per-escrow pinning; no fund migration).
      {
        id: 'USDC_0G',
        roles: ['gig', 'exchange'],
        token: '0x1f3AA82227281cA364bFb3d253B0f1af1Da6473E',
        permit: { version: '2' },
        eip3009: true,
      },
      { id: 'OG', roles: ['exchange'], token: null },
    ],
  },
  {
    // Arc: Circle's L1, where USDC is BOTH the gas asset and the payment asset, so a
    // poster or worker needs no separate gas token (decision 2026-10-02: Solana, 0G
    // and Arc are the strategy). Chain ids VERIFIED 2026-10-05 via eth_chainId against
    // the public RPCs: mainnet 0x13b2 = 5042, testnet 0x4cef52 = 5042002.
    //
    // 'planned' until a broadcast transaction with a receipt exists (the ChainStatus
    // rule): nothing here is deployed, and `SECRET_SCHEMA.eip155` requires an
    // ESCROW_ADDR, so the server cannot serve it before then. NOT MEASURED, and
    // therefore conservative: finality (minConfirmations), the eth_getLogs range
    // limit the listener must respect, and Circle's issuer powers over escrowed
    // balances. NOT VERIFIED: a valid signed authorization actually moving funds on
    // Arc: the Galileo-style agent-hire run is this chain's definition of done.
    id: 'eip155:5042',
    namespace: 'eip155',
    family: 'arc',
    kind: 'mainnet',
    status: 'planned',
    displayName: 'Arc',
    minConfirmations: 2,
    publicRpcUrl: 'https://rpc.mainnet.arc.io',
    // UNVERIFIED: the mainnet explorer host was unreachable when this was written
    // (explorer.mainnet.arc.io); this follows the testnet's pattern. Only the AppKit
    // network definition reads it, and the chain is not served. Confirm before launch.
    explorerUrl: 'https://explorer.mainnet.arc.io',
    // The user pays gas in the native token, and the native token IS USDC, so the
    // existing 'none' ("user pays gas in the native token") already fits: no new
    // policy. See the two Arc assets below for the one trap this creates.
    gasPolicy: 'none',
    assets: [
      // The ERC-20 interface of Circle's USDC: 6 decimals, name 'USDC', version '2'
      // (VERIFIED by calling decimals()/name()/version() on the token, 2026-10-05).
      // NOT an EIP-1967 proxy, so a bytecode scan for selectors proves nothing.
      // TendaEscrow consumes only receiveWithAuthorization (IERC3009).
      {
        id: 'USDC_ARC',
        roles: ['gig', 'exchange'],
        token: '0x3600000000000000000000000000000000000000',
        permit: { version: '2' },
        eip3009: true,
      },
      // THE TRAP: the same dollars as a NATIVE balance (18 decimals). The wallet's USDC
      // headline reads the ERC-20 only (it is the gig asset, and the one with a token
      // address), and this native one is the gas figure; the two must never be summed.
      { id: 'USDC_ARC_NATIVE', roles: ['exchange'], token: null },
    ],
  },
  {
    id: 'eip155:5042002',
    namespace: 'eip155',
    family: 'arc',
    kind: 'testnet',
    status: 'planned',
    displayName: 'Arc Testnet',
    // Testnet: confirm at the first block, like every other testnet entry.
    minConfirmations: 1,
    publicRpcUrl: 'https://rpc.testnet.arc.io',
    explorerUrl: 'https://explorer.testnet.arc.io',
    // Circle's faucet lists "Arc Testnet" (VERIFIED 2026-10-05 on the live page).
    faucetUrl: 'https://faucet.circle.com',
    gasPolicy: 'none',
    assets: [
      {
        id: 'USDC_ARC',
        roles: ['gig', 'exchange'],
        token: '0x3600000000000000000000000000000000000000',
        permit: { version: '2' },
        eip3009: true,
      },
      { id: 'USDC_ARC_NATIVE', roles: ['exchange'], token: null },
    ],
  },
]

/** True iff the asset is the chain's native gas token (no contract, no secret). */
export function isNativeAsset(asset: ChainAsset): boolean {
  return asset.token === null && asset.fromSecret === undefined
}

/**
 * Resolve the address the tx's `feeCurrency` field must carry. For a token that
 * needs a FeeCurrencyDirectory adapter (non-18-decimal, e.g. USDC) that's the
 * adapter; otherwise it's the fee asset's own token (an 18-decimal Mento stable
 * such as cUSD is its own adapter).
 */
export function feeCurrencyAddress(entry: ChainManifestEntry): string | null {
  if (entry.feeCurrency === undefined) return null
  if (entry.feeCurrencyAdapter !== undefined) return entry.feeCurrencyAdapter
  const asset = entry.assets.find((a) => a.id === entry.feeCurrency)
  return asset?.token ?? null
}

/**
 * Assert the data integrity of a manifest. A malformed manifest is a
 * programming error, not a runtime condition, so this runs once at import on
 * CHAIN_MANIFEST (fail-fast, everywhere the module loads) and is independently
 * unit-tested with malformed inputs. Throws on the first violation.
 */
export function assertManifestValid(entries: readonly ChainManifestEntry[]): void {
  const seen = new Set<string>()
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new Error(`CHAIN_MANIFEST: duplicate chain id '${entry.id}'`)
    }
    seen.add(entry.id)

    for (const asset of entry.assets) {
      if (getAssetMeta(asset.id) === null) {
        throw new Error(`CHAIN_MANIFEST: asset '${asset.id}' on '${entry.id}' missing from ASSET_META`)
      }
      if (asset.roles.length === 0) {
        throw new Error(`CHAIN_MANIFEST: asset '${asset.id}' on '${entry.id}' declares no roles`)
      }
      if (asset.permit !== undefined && asset.token === null) {
        throw new Error(
          `CHAIN_MANIFEST: '${asset.id}' on '${entry.id}' declares permit but has no canonical token address`,
        )
      }
      if (asset.permit !== undefined && asset.permit.version.length === 0) {
        throw new Error(`CHAIN_MANIFEST: '${asset.id}' on '${entry.id}' has an empty permit version`)
      }
      if (asset.eip3009 !== undefined && asset.permit === undefined) {
        throw new Error(
          `CHAIN_MANIFEST: '${asset.id}' on '${entry.id}' declares eip3009 but no permit domain to sign under`,
        )
      }
    }
    // Runtime-checked despite being a compile-time union: the landing consumes
    // this module through a Vite source alias and other packages through the
    // CJS dist, so a hand-edited entry that simply omits `status` reaches those
    // readers as `undefined` with no type error at the boundary. `undefined`
    // is falsy, which is exactly how it would be read as "not live" and quietly
    // drop a deployed chain off every surface that filters on it.
    if (entry.status !== 'live' && entry.status !== 'launching' && entry.status !== 'planned') {
      throw new Error(
        `CHAIN_MANIFEST: '${entry.id}' must declare status 'live', 'launching' or 'planned'`,
      )
    }
    // `paused` is a literal `true` or absent. `paused: false` would read as "not
    // paused" here and as a set flag to anything testing for the key, so it is
    // refused rather than being allowed to mean two things.
    if (entry.paused !== undefined && entry.paused !== true) {
      throw new Error(`CHAIN_MANIFEST: '${entry.id}' paused must be \`true\` or omitted`)
    }
    if (entry.assets.filter(isNativeAsset).length !== 1) {
      throw new Error(`CHAIN_MANIFEST: '${entry.id}' must have exactly one native asset`)
    }
    // The CAIP-2 reference of an EVM chain is its numeric chain id, and readers
    // parse it back out: the agent card (#105) emits it as ERC-8004's numeric
    // `chainId`, where a NaN would serialise to `null` in a document committed
    // on-chain. Checked here for the same reason `status` is — the landing
    // consumes this module through a Vite source alias and other packages
    // through the CJS dist, so a hand-edited id reaches them with no type error.
    if (entry.namespace === 'eip155' && !isEvmChainId(entry.id)) {
      throw new Error(
        `CHAIN_MANIFEST: EVM chain '${entry.id}' must be 'eip155:<positive integer>'`,
      )
    }
    if (entry.namespace === 'eip155' && (entry.publicRpcUrl ?? '').length === 0) {
      throw new Error(`CHAIN_MANIFEST: EVM chain '${entry.id}' must set a publicRpcUrl`)
    }
    if (entry.namespace === 'eip155' && (entry.explorerUrl ?? '').length === 0) {
      throw new Error(`CHAIN_MANIFEST: EVM chain '${entry.id}' must set an explorerUrl`)
    }
    if (entry.faucetUrl !== undefined && entry.kind !== 'testnet') {
      throw new Error(`CHAIN_MANIFEST: '${entry.id}' is a ${entry.kind} and cannot declare a faucetUrl`)
    }
    if (entry.faucetUrl !== undefined && !/^https:\/\//.test(entry.faucetUrl)) {
      throw new Error(`CHAIN_MANIFEST: '${entry.id}' faucetUrl must be an https URL`)
    }
    for (const asset of entry.assets) {
      if (asset.openMint !== undefined && (entry.kind !== 'testnet' || asset.token === null)) {
        throw new Error(`CHAIN_MANIFEST: '${asset.id}' on '${entry.id}' declares openMint — testnet ERC-20 mocks only`)
      }
    }
    // The registry tells a testnet reader with a null faucet to mint at the
    // token — so every testnet gig asset must have one answer or the other.
    const gigAsset = entry.assets.find((a) => a.roles.includes('gig'))
    if (entry.kind === 'testnet' && gigAsset !== undefined && entry.faucetUrl === undefined && gigAsset.openMint === undefined) {
      throw new Error(`CHAIN_MANIFEST: testnet '${entry.id}' has gig asset '${gigAsset.id}' with neither a faucetUrl nor openMint`)
    }
    if ((entry.gasPolicy === 'feeCurrency') !== (entry.feeCurrency !== undefined)) {
      throw new Error(`CHAIN_MANIFEST: '${entry.id}' feeCurrency must be set iff gasPolicy is 'feeCurrency'`)
    }
    if (entry.feeCurrency !== undefined && !entry.assets.some((a) => a.id === entry.feeCurrency)) {
      throw new Error(`CHAIN_MANIFEST: '${entry.id}' feeCurrency '${entry.feeCurrency}' is not one of its assets`)
    }
    if (entry.feeCurrencyAdapter !== undefined && entry.feeCurrency === undefined) {
      throw new Error(`CHAIN_MANIFEST: '${entry.id}' feeCurrencyAdapter set without feeCurrency`)
    }
    if (entry.feeCurrencyAdapter !== undefined && !isEvmAddress(entry.feeCurrencyAdapter)) {
      throw new Error(`CHAIN_MANIFEST: '${entry.id}' feeCurrencyAdapter is not a valid EVM address`)
    }
    if (entry.feeCurrency !== undefined && feeCurrencyAddress(entry) === null) {
      throw new Error(`CHAIN_MANIFEST: '${entry.id}' feeCurrency '${entry.feeCurrency}' has no token address`)
    }
    if (entry.gasSeedAmountRaw !== undefined && entry.gasPolicy !== 'native-seed') {
      throw new Error(`CHAIN_MANIFEST: '${entry.id}' gasSeedAmountRaw set without gasPolicy 'native-seed'`)
    }
    if (entry.gasSeedAmountRaw !== undefined && !/^[1-9]\d*$/.test(entry.gasSeedAmountRaw)) {
      throw new Error(`CHAIN_MANIFEST: '${entry.id}' gasSeedAmountRaw must be a positive integer string of base units`)
    }
  }
}

assertManifestValid(CHAIN_MANIFEST)
