/**
 * The SHAPE a validated chain's secrets take, and the assembly that produces
 * it from the raw per-field map.
 *
 * Split from ./schema because the two answer different questions and change for
 * different reasons: schema says which env vars exist and whether a value is
 * well-formed, this says what a caller gets once they are. The union below
 * mirrors `SECRET_SCHEMA` 1:1 — a field added there without a home here fails
 * to compile in `assemble`, which is the drift guard.
 */

import type { ChainManifestEntry } from '@tenda/shared'

/** Resolved secrets per active chain, a discriminated union over namespace. */
export type ResolvedChainSecret =
  | {
      namespace: 'solana'
      chainId: string
      rpcUrl: string
      rpcUrlFallback?: string
      treasury: string
      disputeAdmin?: string
      usdcMint?: string
      gasSeedKey?: string
      webhookSecret?: string
      relayerKey?: string
    }
  | {
      namespace: 'eip155'
      chainId: string
      rpcUrl: string
      rpcUrlFallback?: string
      escrow: string
      /** Deploy block of the escrow contract (polling first-run start). */
      escrowDeployBlock?: number
      treasury: string
      disputeAdmin?: string
      paymasterUrl?: string
      webhookSecret?: string
      relayerKey?: string
      /** Hot wallet funding the first-link native gas seed (#53a). */
      gasSeedKey?: string
      /**
       * Is this chain allowed to spend the relayer float on abandoned-escrow
       * sweeps (#43)? Absent = NO. Separate from `relayerKey` on purpose: the
       * key says a sweep is POSSIBLE here, this says it is WANTED.
       */
      sweepEnabled?: boolean
    }

/** Convenience aliases for the two namespace variants of the resolved union. */
export type SolanaChainSecret = Extract<ResolvedChainSecret, { namespace: 'solana' }>
export type EvmChainSecret = Extract<ResolvedChainSecret, { namespace: 'eip155' }>

/** Narrowing accessor: a required field is guaranteed present post-validation. */
function must(present: Map<string, string>, key: string, chainId: string): string {
  const value = present.get(key)
  if (value === undefined) {
    // Unreachable: required fields are validated before assembly. Guards the
    // invariant rather than reaching for a non-null assertion.
    throw new Error(`internal: required secret '${key}' absent for ${chainId} after validation`)
  }
  return value
}

export function assemble(
  entry: ChainManifestEntry,
  present: Map<string, string>,
): ResolvedChainSecret {
  if (entry.namespace === 'solana') {
    return {
      namespace: 'solana',
      chainId: entry.id,
      rpcUrl: must(present, 'rpcUrl', entry.id),
      rpcUrlFallback: present.get('rpcUrlFallback'),
      treasury: must(present, 'treasury', entry.id),
      disputeAdmin: present.get('disputeAdmin'),
      usdcMint: present.get('usdcMint'),
      gasSeedKey: present.get('gasSeedKey'),
      webhookSecret: present.get('webhookSecret'),
      relayerKey: present.get('relayerKey'),
    }
  }
  const escrowDeployBlock = present.get('escrowDeployBlock')
  return {
    namespace: 'eip155',
    chainId: entry.id,
    rpcUrl: must(present, 'rpcUrl', entry.id),
    rpcUrlFallback: present.get('rpcUrlFallback'),
    escrow: must(present, 'escrow', entry.id),
    // Validated as a bounded decimal ('uint'), so Number() is exact.
    ...(escrowDeployBlock !== undefined ? { escrowDeployBlock: Number(escrowDeployBlock) } : {}),
    treasury: must(present, 'treasury', entry.id),
    disputeAdmin: present.get('disputeAdmin'),
    paymasterUrl: present.get('paymasterUrl'),
    webhookSecret: present.get('webhookSecret'),
    relayerKey: present.get('relayerKey'),
    gasSeedKey: present.get('gasSeedKey'),
    // Validated as exactly 'true' | 'false', so this comparison is total —
    // and an absent var lands on `false` rather than on undefined-is-truthy.
    sweepEnabled: present.get('sweepEnabled') === 'true',
  }
}
