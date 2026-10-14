/**
 * Per-deployment chain SECRETS loader. The public facts live in the shared
 * CHAIN_MANIFEST; this reads the deployment-specific endpoints/addresses from
 * flat, conventionally-named env vars and returns one validated, typed record
 * per ACTIVE chain.
 *
 * Env convention, `CHAIN_<SANITISED_ID>_<FIELD>`, e.g.
 *   CHAIN_EIP155_8453_RPC_URL, CHAIN_SOLANA_DEVNET_PROGRAM_ID
 * Keys are CONSTRUCTED from the manifest id + a fixed per-namespace field set,
 * never parsed back, so single-underscore separators are unambiguous.
 *
 * Activation rule (replaces the old null-gating AND the *_NETWORK toggles):
 *   - none of a chain's fields set        → chain INACTIVE (skipped silently)
 *   - all required set + valid             → chain ACTIVE
 *   - some-but-not-all required, or any
 *     present-but-malformed                → BOOT ERROR (names the exact key)
 * Plus: at most ONE active chain per `family` (Base mainnet XOR Base Sepolia),
 * and any unrecognised `CHAIN_*` env var is a boot error (kills silent typos).
 * And a configured chain must be one the manifest declares `status: 'live'`
 * (#145): the manifest is what the landing announces and the env is what this
 * process serves, and nothing else makes the two agree. A `planned` chain with
 * env set would be SERVED as settleable while the site says it is coming; a
 * `launching` chain already running would keep announcing a launch. Either is
 * refused at boot, naming the chain — the fix is to flip the manifest in the
 * same release as the env, never to widen this rule. Availability still comes
 * from ENV; the manifest supplies facts, and this only makes the two agree.
 *
 * Was one 314-line file, split along the seam the activation rule already
 * describes: ./schema is which vars exist and whether a value is well-formed,
 * ./resolve is what a caller gets once it is, and this file is the pass over
 * the manifest that turns env into results plus the process-wide cache. The
 * `@server/chains/secrets` import path is unchanged, which is why this barrel
 * exists.
 */

import { CHAIN_MANIFEST, chainById, type ChainManifestEntry } from '@tenda/shared'
import { optionalEnv } from '@server/config/env'
import {
  chainEnvPrefix,
  describeKind,
  describeShape,
  isValid,
  knownChainEnvKeys,
  schemaFor,
} from './schema'
import { assemble } from './resolve'
import type { EvmChainSecret, ResolvedChainSecret, SolanaChainSecret } from './resolve'

export { chainEnvPrefix, knownChainEnvKeys } from './schema'
export type { SecretFieldSpec, SecretKind } from './schema'
export type { EvmChainSecret, ResolvedChainSecret, SolanaChainSecret } from './resolve'

/**
 * Load and validate chain secrets from `env`. `env` is a parameter (defaulting
 * to process.env) so the loader is fully testable without global mutation.
 * Aggregates ALL configuration errors and throws once, so a misconfigured
 * deployment sees every problem at once rather than one-per-restart.
 */
export function loadChainSecrets(
  env: NodeJS.ProcessEnv = process.env,
  manifest: readonly ChainManifestEntry[] = CHAIN_MANIFEST,
): Map<string, ResolvedChainSecret> {
  const errors: string[] = []
  const result = new Map<string, ResolvedChainSecret>()
  const activeByFamily = new Map<string, string>()

  // Typo guard: any CHAIN_-prefixed var that no manifest chain would read.
  const valid = knownChainEnvKeys(manifest)
  const unknown = Object.keys(env).filter(
    (k) => k.startsWith('CHAIN_') && !valid.has(k) && optionalEnv(k, env) !== null,
  )
  if (unknown.length > 0) {
    errors.push(`unrecognised chain env var(s): ${unknown.sort().join(', ')}, check spelling against the manifest`)
  }

  for (const entry of manifest) {
    const prefix = chainEnvPrefix(entry.id)
    const schema = schemaFor(entry)
    const present = new Map<string, string>()
    for (const spec of schema) {
      // Empty / whitespace-only is treated as ABSENT, not malformed, so a
      // commented-out or blank `VAR=` line leaves the chain inactive —
      // `optionalEnv` (config/env.ts) is where that rule lives for every reader.
      const value = optionalEnv(`${prefix}_${spec.envSuffix}`, env)
      if (value !== null) present.set(spec.key, value)
    }

    if (present.size === 0) continue // inactive, chain not configured here

    // Diagnosed alongside the field errors rather than instead of them, so a
    // deployment that is wrong twice hears about both on the one restart.
    const notLive = entry.status !== 'live'
    if (notLive) {
      errors.push(
        `${entry.id}: configured (${prefix}_*) but the manifest declares status '${entry.status}' — only a 'live' chain may be served; flip CHAIN_MANIFEST to 'live' in the same release, or unset its env`,
      )
    }

    const missingRequired = schema
      .filter((s) => s.required && !present.has(s.key))
      .map((s) => `${prefix}_${s.envSuffix}`)
    const malformed: string[] = []
    for (const spec of schema) {
      const value = present.get(spec.key)
      if (value !== undefined && !isValid(spec.kind, value)) {
        // Name the expectation AND the observed shape. The value itself never
        // appears — these are private keys and metered endpoints, and this
        // string goes to container logs. See describeShape.
        malformed.push(
          `${prefix}_${spec.envSuffix} (expected ${describeKind(spec.kind)}, got ${describeShape(spec.kind, value)})`,
        )
      }
    }

    if (missingRequired.length > 0) {
      errors.push(`${entry.id}: partially configured, missing ${missingRequired.join(', ')}`)
    }
    if (malformed.length > 0) {
      errors.push(`${entry.id}: malformed value(s) for ${malformed.join(', ')}`)
    }
    if (notLive || missingRequired.length > 0 || malformed.length > 0) continue

    const clash = activeByFamily.get(entry.family)
    if (clash !== undefined) {
      errors.push(
        `${entry.id} and ${clash} are both configured but share family '${entry.family}', a deployment runs one network per family`,
      )
      continue
    }
    activeByFamily.set(entry.family, entry.id)
    result.set(entry.id, assemble(entry, present))
  }

  if (errors.length > 0) {
    throw new Error(`Chain secret configuration error:\n  - ${errors.join('\n  - ')}`)
  }
  return result
}

let cached: Map<string, ResolvedChainSecret> | undefined

/**
 * Cached process-wide chain secrets (mirrors getConfig): loaded once from
 * process.env against the live manifest. Consumers call this instead of
 * reading per-chain env directly.
 */
export function getChainSecrets(): Map<string, ResolvedChainSecret> {
  if (cached === undefined) cached = loadChainSecrets()
  return cached
}

/** Test seam: drop the cache so a later getChainSecrets re-reads env. */
export function resetChainSecretsCache(): void {
  cached = undefined
}

/**
 * The single active Solana chain, if configured. The loader guarantees at most
 * one chain per family and Solana clusters share family 'solana', so the
 * namespace match is unique.
 */
export function solanaSecret(
  secrets: Map<string, ResolvedChainSecret> = getChainSecrets(),
): SolanaChainSecret | undefined {
  for (const secret of secrets.values()) {
    if (secret.namespace === 'solana') return secret
  }
  return undefined
}

/** The active paymaster-managed EVM chain (BASE-style), if configured. */
export function paymasterChainSecret(
  secrets: Map<string, ResolvedChainSecret> = getChainSecrets(),
): EvmChainSecret | undefined {
  for (const secret of secrets.values()) {
    if (secret.namespace === 'eip155' && chainById(secret.chainId).gasPolicy === 'paymaster') {
      return secret
    }
  }
  return undefined
}
