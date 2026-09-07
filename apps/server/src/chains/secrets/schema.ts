/**
 * WHICH env vars a chain reads, and what a well-formed value looks like.
 *
 * The half of the loader that depends only on the manifest — no env, no
 * results. Adding a field to a namespace is an edit here and nowhere else,
 * which is the property worth protecting: the resolved shape in ./resolve
 * mirrors this 1:1, so the compiler objects if the two drift.
 */

import { CHAIN_MANIFEST, type ChainManifestEntry } from '@tenda/shared'
import { isAbsoluteUrl } from '@server/lib/env'

/** Validation classes for a secret value. */
export type SecretKind = 'url' | 'evmAddr' | 'base58' | 'uint' | 'str'

export interface SecretFieldSpec {
  /** Logical key on the resolved record. */
  key: string
  /** Env-var suffix appended after the sanitised chain id. */
  envSuffix: string
  required: boolean
  kind: SecretKind
}

/**
 * Secret schema keyed by NAMESPACE (not family): every EVM chain reads the
 * same fields, every Solana chain reads the same fields, so adding an EVM L2
 * needs no schema change. The resolved record's shape mirrors this 1:1.
 */
export const SECRET_SCHEMA: Record<string, readonly SecretFieldSpec[]> = {
  // NOTE: the Solana program id is NOT a secret, it is the deployed IDL
  // artifact (ESCROW_IDL.address), the single source used by the adapter,
  // pdas, and the seeder. Treasury + RPC are the genuine per-deployment values.
  solana: [
    { key: 'rpcUrl', envSuffix: 'RPC_URL', required: true, kind: 'url' },
    { key: 'rpcUrlFallback', envSuffix: 'RPC_URL_FALLBACK', required: false, kind: 'url' },
    { key: 'treasury', envSuffix: 'TREASURY_ADDR', required: true, kind: 'base58' },
    // On-chain dispute-resolution authority (rotatable via the multisig).
    // Optional: enables the admin sign pre-flight check when set.
    { key: 'disputeAdmin', envSuffix: 'DISPUTE_ADMIN_ADDR', required: false, kind: 'base58' },
    { key: 'usdcMint', envSuffix: 'USDC_MINT', required: false, kind: 'base58' },
    { key: 'gasSeedKey', envSuffix: 'GAS_SEED_KEY', required: false, kind: 'str' },
    { key: 'webhookSecret', envSuffix: 'WEBHOOK_SECRET', required: false, kind: 'str' },
  ],
  eip155: [
    { key: 'rpcUrl', envSuffix: 'RPC_URL', required: true, kind: 'url' },
    // Secondary RPC endpoint: when set, the adapter's transport fails over to
    // it on primary errors/timeouts (a degraded provider can't block tx builds).
    { key: 'rpcUrlFallback', envSuffix: 'RPC_URL_FALLBACK', required: false, kind: 'url' },
    { key: 'escrow', envSuffix: 'ESCROW_ADDR', required: true, kind: 'evmAddr' },
    // Block the escrow contract was deployed at: the polling listener's exact
    // first-run start (no event can predate it). Optional: absent falls back
    // to the listener's bounded recency window, with a boot-time warning.
    { key: 'escrowDeployBlock', envSuffix: 'ESCROW_DEPLOY_BLOCK', required: false, kind: 'uint' },
    { key: 'treasury', envSuffix: 'TREASURY_ADDR', required: true, kind: 'evmAddr' },
    { key: 'disputeAdmin', envSuffix: 'DISPUTE_ADMIN_ADDR', required: false, kind: 'evmAddr' },
    { key: 'paymasterUrl', envSuffix: 'PAYMASTER_URL', required: false, kind: 'url' },
    { key: 'webhookSecret', envSuffix: 'WEBHOOK_SECRET', required: false, kind: 'str' },
  ],
}

/**
 * Schemes a chain endpoint may use. NAMED rather than an inline
 * `['https', 'http']` at the call site: config.ts's BASE_URL_PROTOCOLS carries
 * a comment warning that a second spelling of a protocol policy is "a
 * difference nothing would catch" when one of them tightens later, and this
 * would have been a third.
 *
 * Deliberately its OWN constant rather than reusing BASE_URL_PROTOCOLS, on the
 * same reasoning lib/slack keeps WEBHOOK_PROTOCOLS separate: these are
 * different domains that happen to agree today. A deployment could sensibly
 * force the admin dashboard URL to https-only without also banning
 * `http://localhost:8545` for a dev RPC node — and sharing one constant would
 * make that tightening break local development silently.
 */
const CHAIN_ENDPOINT_PROTOCOLS = ['https', 'http'] as const

/** `CHAIN_` + the chain id upper-cased with every non-alphanumeric run → `_`. */
export function chainEnvPrefix(id: string): string {
  return `CHAIN_${id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`
}

export function schemaFor(entry: ChainManifestEntry): readonly SecretFieldSpec[] {
  const schema = SECRET_SCHEMA[entry.namespace]
  if (schema === undefined) {
    throw new Error(`no secret schema for namespace '${entry.namespace}' (chain ${entry.id})`)
  }
  return schema
}

export function isValid(kind: SecretKind, value: string): boolean {
  switch (kind) {
    case 'url':
      // Shared with config.ts and lib/slack — lib/env.ts's rule 2, which this
      // reader had adopted rule 1 (`optionalEnv`) of but not this one. A
      // protocol-only check is NOT enough: `new URL('https:rpc.example.com')`
      // parses happily, protocol `https:`, host `rpc.example.com`, so the
      // missing-slashes typo used to pass boot and fail later at the point of
      // use. `ftp://x.com` used to pass too.
      //
      // http/https only, because that is what every consumer of these three
      // fields can actually speak: EVM rpc_url goes to viem's `http()`
      // transport, Solana's to `new Connection()`, and paymaster_url to
      // `fetch(url, { method: 'POST' })`. A ws:// endpoint would need viem's
      // separate webSocket() transport, so accepting one here would only move
      // the failure to runtime.
      return isAbsoluteUrl(value, CHAIN_ENDPOINT_PROTOCOLS)
    case 'evmAddr':
      return /^0x[0-9a-fA-F]{40}$/.test(value)
    case 'base58':
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)
    case 'uint':
      // Decimal block ordinal; bounded so Number() stays exact (2^53 blocks
      // is far beyond any chain's height).
      return /^\d{1,15}$/.test(value)
    case 'str':
      return value.length > 0
  }
}

/**
 * Every env key the manifest could legitimately read, powers the boot-time
 * typo guard AND the .env.example parity test (documented CHAIN_* names must
 * be names the loader actually reads, so the docs can't silently rot).
 */
export function knownChainEnvKeys(
  manifest: readonly ChainManifestEntry[] = CHAIN_MANIFEST,
): Set<string> {
  const keys = new Set<string>()
  for (const entry of manifest) {
    const prefix = chainEnvPrefix(entry.id)
    for (const spec of schemaFor(entry)) keys.add(`${prefix}_${spec.envSuffix}`)
  }
  return keys
}
