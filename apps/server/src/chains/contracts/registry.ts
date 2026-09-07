/**
 * The set of escrow contracts each chain is allowed to transact with, loaded
 * once at boot from `chain_contracts`.
 *
 * `chains.escrow_program` answers "which contract is current"; this answers
 * "which contracts are legitimate", and after a redeploy those differ — an
 * escrow funded before the swap still holds its money in the old contract, so
 * the server must keep transacting there. Reading the answer from config +
 * `chain_contracts` rather than from `escrows.escrow_contract` is what keeps a
 * DB row from being able to nominate the address we send funds to.
 *
 * Loaded at BOOT, not per request: `server.ts` runs `seedOnBoot` before the
 * chains plugin (documented there as load-bearing), so by the time this runs
 * the seed has already recorded the current contract. A per-request read would
 * also mean a DB blip could silently narrow the set mid-flight.
 */

import { inArray } from 'drizzle-orm'
import { chain_contracts } from '@tenda/shared/db/schema'
import type { ChainNamespace } from '@tenda/shared/db/schema/chains'
import type { AppDatabase } from '@server/plugins/db'
import { escrowAddressOf } from '@server/chains/registry-sync'
import type { ResolvedChainSecret } from '@server/chains/secrets'
import { normalizeContractAddress } from './normalize'

/** What the registry needs to know about a configured chain. */
export interface ChainContractSource {
  chain_id: string
  namespace: ChainNamespace
  /** The contract this deployment transacts with now (`adapter.escrowAddress`). */
  escrowAddress: string
}

export interface ChainContracts {
  namespace: ChainNamespace
  /** Normalised current contract. */
  current: string
  /** Normalised known contracts, current always included. */
  known: ReadonlySet<string>
}

export interface ContractRegistry {
  /** Undefined for a chain this deployment has no adapter for. */
  get(chain_id: string): ChainContracts | undefined
  /** Every configured chain, for the boot consistency probe. */
  list(): ReadonlyArray<{ chain_id: string } & ChainContracts>
}

/**
 * Build the registry from the recorded history plus the live configuration.
 *
 * The union with `current` is NOT optional. Derive the set from stored rows
 * alone and a contract deployed but not yet seeded — or seeded into a database
 * that was since restored from an older snapshot — is a contract the server
 * refuses to use while actively pointing new escrows at it. Including it
 * unconditionally means the worst case is a set that is too WIDE by one entry
 * we deployed ourselves, which costs nothing, rather than too narrow, which
 * strands escrows.
 */
export function buildContractRegistry(
  sources: ReadonlyArray<ChainContractSource>,
  rows: ReadonlyArray<{ chain_id: string; address: string }>,
): ContractRegistry {
  const byChain = new Map<string, ChainContracts>()

  for (const source of sources) {
    const current = normalizeContractAddress(source.namespace, source.escrowAddress)
    const known = new Set<string>([current])
    for (const row of rows) {
      if (row.chain_id !== source.chain_id) continue
      known.add(normalizeContractAddress(source.namespace, row.address))
    }
    byChain.set(source.chain_id, { namespace: source.namespace, current, known })
  }

  return {
    get: (chain_id) => byChain.get(chain_id),
    list: () => [...byChain].map(([chain_id, contracts]) => ({ chain_id, ...contracts })),
  }
}

/**
 * Registry inputs straight from the chain secrets.
 *
 * Deliberately NOT from the built adapters, though they expose the same
 * `escrowAddress`: the EVM adapter needs the known set in order to decode
 * receipts, so building the registry from adapters would be a cycle. Secrets
 * come first, and `escrowAddressOf` is the same single source the seed and the
 * boot check already resolve the current contract through — so no third
 * spelling of "which contract is current" enters the codebase.
 */
export function contractSourcesFromSecrets(
  secrets: ReadonlyMap<string, ResolvedChainSecret>,
): ChainContractSource[] {
  return [...secrets.values()].map((secret) => ({
    chain_id: secret.chainId,
    namespace: secret.namespace,
    escrowAddress: escrowAddressOf(secret),
  }))
}

/** Read the recorded history for the given chains — one query, at boot. Private:
 * `loadContractRegistry` is the only caller, and the only entry point callers need. */
async function loadContractRows(
  db: AppDatabase,
  chain_ids: ReadonlyArray<string>,
): Promise<Array<{ chain_id: string; address: string }>> {
  // `inArray` with an empty list is invalid SQL, and there is nothing to ask.
  if (chain_ids.length === 0) return []
  return db
    .select({ chain_id: chain_contracts.chain_id, address: chain_contracts.address })
    .from(chain_contracts)
    .where(inArray(chain_contracts.chain_id, [...chain_ids]))
}

/** Load + build in one call. The chains plugin's entry point. */
export async function loadContractRegistry(
  db: AppDatabase,
  sources: ReadonlyArray<ChainContractSource>,
): Promise<ContractRegistry> {
  const rows = await loadContractRows(
    db,
    sources.map((s) => s.chain_id),
  )
  return buildContractRegistry(sources, rows)
}
