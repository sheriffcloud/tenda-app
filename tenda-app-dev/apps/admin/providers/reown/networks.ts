/**
 * Reown ↔ CHAIN_MANIFEST bridge (kept in lockstep with apps/web/wallet/reown/
 * networks.ts by design — each Next app owns its wallet wiring; the
 * manifest-coverage test in test/providers/reown-networks.test.ts turns silent
 * drift into a red build). The manifest is the single source of which chains
 * exist.
 *
 * EVM networks are DERIVED from the manifest (shared `evmAppKitNetworkOf`) —
 * adding an EVM chain is a manifest entry plus its secrets, with no edit here.
 * Only Solana still maps to Reown presets: the manifest records no Solana RPC
 * (clients derive theirs from `clusterApiUrl`), so there is nothing to derive
 * a network from. A Solana chain missing its preset is a deploy-time gap and
 * fails loud at module init rather than silently dropping a chain from the
 * connect modal.
 */
import { solana, solanaDevnet } from '@reown/appkit/networks'
import type { AppKitNetwork } from '@reown/appkit/networks'
import { CHAIN_MANIFEST, evmAppKitNetworkOf, type ChainManifestEntry } from '@tenda/shared'

const SOLANA_NETWORK_BY_CHAIN_ID: Record<string, AppKitNetwork> = {
  'solana:mainnet': solana,
  'solana:devnet': solanaDevnet,
}

function buildNetwork(chain: ChainManifestEntry): AppKitNetwork {
  if (chain.namespace === 'eip155') return evmAppKitNetworkOf(chain)
  const preset = SOLANA_NETWORK_BY_CHAIN_ID[chain.id]
  if (preset === undefined) {
    throw new Error(`reown: no AppKitNetwork mapped for manifest chain '${chain.id}'`)
  }
  return preset
}

/**
 * Built once so every consumer — the modal's registration list, the Wagmi
 * adapter, and `switchNetwork` — hands AppKit the SAME object per chain, as
 * the hand map this replaces did.
 */
const NETWORK_BY_CHAIN_ID: ReadonlyMap<string, AppKitNetwork> = new Map(
  CHAIN_MANIFEST.map((chain) => [chain.id, buildNetwork(chain)]),
)

function networkFor(chainId: string): AppKitNetwork {
  const network = NETWORK_BY_CHAIN_ID.get(chainId)
  if (network === undefined) {
    throw new Error(`reown: no AppKitNetwork mapped for manifest chain '${chainId}'`)
  }
  return network
}

type NonEmpty = [AppKitNetwork, ...AppKitNetwork[]]

function toNonEmpty(networks: AppKitNetwork[], label: string): NonEmpty {
  const [first, ...rest] = networks
  if (first === undefined) throw new Error(`reown: no ${label} networks configured`)
  return [first, ...rest]
}

/** Every manifest chain, as Reown networks — the AppKit modal's full set. */
export const appKitNetworks: NonEmpty = toNonEmpty(
  CHAIN_MANIFEST.map((chain) => networkFor(chain.id)),
  'AppKit',
)

/** EVM-only subset — what the Wagmi adapter is constructed with. */
export const evmNetworks: NonEmpty = toNonEmpty(
  CHAIN_MANIFEST.filter((chain) => chain.namespace === 'eip155').map((chain) => networkFor(chain.id)),
  'EVM',
)

/** Reown network for a CAIP-2 id (used to switch the wallet before signing). */
export function appKitNetworkForChain(chainId: string): AppKitNetwork {
  return networkFor(chainId)
}
