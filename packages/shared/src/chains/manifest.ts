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
import { ASSET_META } from '../constants/assets'

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
export type AssetRole = 'gig' | 'exchange'

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
}

export interface ChainManifestEntry {
  /** CAIP-2 id, e.g. `'eip155:8453'`, `'solana:devnet'`. */
  id: string
  namespace: ChainNamespace
  /** Network group; one active chain per family per deployment. */
  family: string
  kind: 'mainnet' | 'testnet'
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
   * gas_seed columns remain NULL and `dispatchGasSeeds` skips the chain). The
   * FUNDING wallet is not recorded here — it's derived from the deployment's hot
   * wallet secret (`CHAIN_<id>_GAS_SEED_KEY`) at seed time, so the two can't drift.
   */
  gasSeedAmountRaw?: string
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
    displayName: 'Solana Devnet',
    minConfirmations: 1,
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
    displayName: 'BASE',
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
      },
      { id: 'ETH_BASE', roles: ['exchange'], token: null },
    ],
  },
  {
    id: 'eip155:84532',
    namespace: 'eip155',
    family: 'base',
    kind: 'testnet',
    displayName: 'Base Sepolia',
    // Testnet: confirm at the first block (~Solana-instant UX for dev/device
    // smoke). Mainnet keeps a 2-block margin.
    minConfirmations: 1,
    publicRpcUrl: 'https://sepolia.base.org',
    explorerUrl: 'https://sepolia.basescan.org',
    gasPolicy: 'paymaster',
    assets: [
      // Circle USDC on Base Sepolia — confirmed live (dress-rehearsal #124);
      // permit version() + DOMAIN_SEPARATOR verified on-chain 2026-07-03.
      {
        id: 'USDC_BASE',
        roles: ['gig', 'exchange'],
        token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        permit: { version: '2' },
      },
      { id: 'ETH_BASE', roles: ['exchange'], token: null },
    ],
  },
  {
    id: 'eip155:42220',
    namespace: 'eip155',
    family: 'celo',
    kind: 'mainnet',
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
      },
      { id: 'cUSD', roles: ['exchange'], token: '0x765DE816845861e75A25fCA122bb6898B8B1282a' },
      { id: 'CELO', roles: ['exchange'], token: null },
    ],
  },
  {
    id: 'eip155:11142220',
    namespace: 'eip155',
    family: 'celo',
    kind: 'testnet',
    displayName: 'Celo Sepolia',
    minConfirmations: 3,
    publicRpcUrl: 'https://forno.celo-sepolia.celo-testnet.org',
    explorerUrl: 'https://sepolia.celoscan.io',
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
      },
      { id: 'CELO', roles: ['exchange'], token: null },
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
      if (ASSET_META[asset.id] === undefined) {
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
    }
    if (entry.assets.filter(isNativeAsset).length !== 1) {
      throw new Error(`CHAIN_MANIFEST: '${entry.id}' must have exactly one native asset`)
    }
    if (entry.namespace === 'eip155' && (entry.publicRpcUrl ?? '').length === 0) {
      throw new Error(`CHAIN_MANIFEST: EVM chain '${entry.id}' must set a publicRpcUrl`)
    }
    if (entry.namespace === 'eip155' && (entry.explorerUrl ?? '').length === 0) {
      throw new Error(`CHAIN_MANIFEST: EVM chain '${entry.id}' must set an explorerUrl`)
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
    if (entry.feeCurrencyAdapter !== undefined && !/^0x[0-9a-fA-F]{40}$/.test(entry.feeCurrencyAdapter)) {
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
