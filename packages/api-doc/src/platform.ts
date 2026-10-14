/**
 * The one PLATFORM path the agent document carries: `GET /v1/platform/chains`,
 * the deployment's own answer to "which chains can I settle on here" (#126).
 *
 * WHY IT IS HERE. `chain_id` used to be documented as an enum of every
 * `CHAIN_MANIFEST` entry, which offered agents `solana:mainnet` and
 * `eip155:8453` — both `status: 'planned'`, refused by every deployment that
 * exists. The manifest is the set of chains this CODEBASE knows; the set a
 * deployment settles on comes from its `CHAIN_<id>_*` secrets, and the two are
 * different facts. The document is a module-load constant and can only state
 * the first, so ./scalars now checks the SHAPE of a chain id and points here
 * for the list — and a pointer to an endpoint the document does not describe
 * is the same dead end the enum was, one indirection further out.
 *
 * The route already answers with exactly the right set: enabled in the
 * database INTERSECTED with the adapter registry, so a chain the server cannot
 * build or verify a transaction on is omitted rather than advertised. Nothing
 * about that behaviour is added here; it is only made visible to a reader who
 * never leaves this document.
 *
 * ONE FILE, not the `paths-x` / `schemas-x` pair the two older surfaces use.
 * Those pairs split a SURFACE in half — v0 reads across ./paths + ./schemas, v1
 * writes across ./paths-agent + ./schemas-agent — and each half carries enough
 * to stand alone. This surface is one path and three schemas; splitting it the
 * same way would buy symmetry at the cost of two files neither of which can be
 * read on its own.
 *
 * IT IS ALSO THE ADDRESS SOURCE. `escrow_address` is the contract the agent's
 * own signature authorises as spender — served from the registry the server
 * itself uses, never from the stored column, which is written by `db:seed` and
 * has drifted two contract generations behind before now.
 */
import { ASSET_ROLES, CHAIN_KINDS, ESCROW_LIMITS, apiRoutes, type ChainRegistryEntry, type PlatformContract } from '@tenda/shared'
import { chainNamespaceEnum } from '@tenda/shared/db/schema'
import { allKeys, closedFor, nullable, ref, type PlatformComponentName, type SchemaObject } from './schema-types'
import { json, type PathItem } from './paths'
import { blocks } from './prose'
import { chainIdShape } from './scalars'

/**
 * One enabled asset on one enabled chain — what a client may price a task in.
 *
 * `required` is DERIVED from these properties, not restated beside them: the
 * wire type has no optional key, and a hand-written list silently fell behind
 * when `roles` was added — the schema declared the field and did not require
 * it, so a response omitting it would still have validated.
 */
type ChainRegistryAssetWire = ChainRegistryEntry['assets'][number]
const CHAIN_REGISTRY_ASSET_PROPERTIES: Readonly<Record<keyof ChainRegistryAssetWire, SchemaObject>> = {
  id: { type: 'string', description: 'As sent in `asset`' },
  symbol: { type: 'string' },
  decimals: { type: 'integer', minimum: 0 },
  is_stable: { type: 'boolean' },
  token_address: nullable({ type: 'string', description: 'ERC-20 contract / SPL mint; null for the native gas token' }),
  supports_permit: { type: 'boolean', description: 'EIP-2612: approvable by signature' },
  funds_by_signature: {
    type: 'boolean',
    description:
      'This asset can fund a task by signature on this chain — the POST /v1/agent/tasks path. EVM: the token carries EIP-3009 receiveWithAuthorization under its permit domain (declared; the relay still probes the live token before quoting). Solana: every asset, since the creator signs the whole transaction and Tenda pays the fee. False = that post answers 422 RELAY_UNSUPPORTED_ASSET for this asset — choose another asset or chain. supports_permit is a different capability (EIP-2612 approval) and does not imply this one.',
  },
  roles: {
    type: 'array',
    items: { type: 'string', enum: ASSET_ROLES },
    description: 'What this asset may be used for HERE. A gig REQUIRES the one asset whose roles include `gig`; any other is refused 422.',
  },
}
const chainRegistryAsset: SchemaObject = closedFor<ChainRegistryAssetWire>(
  CHAIN_REGISTRY_ASSET_PROPERTIES,
  allKeys<ChainRegistryAssetWire>(CHAIN_REGISTRY_ASSET_PROPERTIES),
)

/** Same rule as the asset above: no optional key, so `required` is derived. */
const CHAIN_REGISTRY_ENTRY_PROPERTIES: Readonly<Record<keyof ChainRegistryEntry, SchemaObject>> = {
  id: chainIdShape,
  namespace: { type: 'string', enum: chainNamespaceEnum },
  display_name: { type: 'string' },
  network_kind: { type: 'string', enum: CHAIN_KINDS, description: 'mainnet or testnet — read it with faucet_url: on a mainnet null means real money and no free source' },
  escrow_address: { type: 'string', description: 'Escrow contract / program id — the spender an agent authorises' },
  relayed_funding_available: {
    type: 'boolean',
    description:
      'True iff this deployment holds a relayer for the chain, so the one-shot can fund a task here. False: POST /v1/agent/tasks answers 503 RELAY_UNAVAILABLE on it (still listed — a caller paying its own gas can settle here). Choose a chain with this true',
  },
  approval_window_seconds: {
    type: 'integer',
    // The contracts' own range (ESCROW_LIMITS mirrors both, parity-guarded):
    // the document states what the chain can actually hold.
    minimum: ESCROW_LIMITS.minApprovalWindowSeconds,
    maximum: ESCROW_LIMITS.maxApprovalWindowSeconds,
    description: 'The poster\'s review window here, in seconds, read from the escrow contract: after proof lands the worker may claim this long later (a gig\'s approval_deadline is the exact instant). Differs per chain',
  },
  rpc_url: nullable({ type: 'string', description: 'Public read-only JSON-RPC endpoint; null where the client derives it (Solana clusters)' }),
  explorer_url: nullable({ type: 'string', description: 'Block-explorer base URL, or null' }),
  faucet_url: nullable({
    type: 'string',
    description: 'Where to obtain this chain\'s TEST USDC. Null on mainnets, and on a testnet whose gig token is a repo mock — there the token\'s mint() is open and callable by anyone, so mint to yourself at the asset\'s token_address. `network_kind` tells the two nulls apart',
  }),
  assets: { type: 'array', items: ref('ChainRegistryAsset') },
}
const chainRegistryEntry: SchemaObject = closedFor<ChainRegistryEntry>(
  CHAIN_REGISTRY_ENTRY_PROPERTIES,
  allKeys<ChainRegistryEntry>(CHAIN_REGISTRY_ENTRY_PROPERTIES),
  'A chain THIS deployment settles on.',
)

type ChainsResponse = PlatformContract['chains']['response']

const CHAIN_REGISTRY_PROPERTIES: Readonly<Record<keyof ChainsResponse, SchemaObject>> = {
  data: { type: 'array', items: ref('ChainRegistryEntry') },
}
const chainRegistry: SchemaObject = closedFor<ChainsResponse>(
  CHAIN_REGISTRY_PROPERTIES,
  allKeys<ChainsResponse>(CHAIN_REGISTRY_PROPERTIES),
  'What this deployment settles on — never what the codebase knows.',
)

export const AGENT_API_PLATFORM_SCHEMAS: Readonly<Record<PlatformComponentName, SchemaObject>> = {
  ChainRegistryAsset: chainRegistryAsset,
  ChainRegistryEntry: chainRegistryEntry,
  ChainRegistry: chainRegistry,
}

export const AGENT_API_PLATFORM_PATHS: Readonly<Record<string, PathItem>> = {
  [apiRoutes.platform.chains]: {
    get: {
      operationId: 'listChains',
      summary: 'The chains THIS deployment settles on, and which of them can relay',
      description:
        blocks(
          '**Anonymous, and per-deployment.** A chain appears here only when this server holds its configuration, can build and verify transactions on it, and can read its contract\'s review window — so a testnet deployment and a mainnet one answer differently.',
          `**Listed is NOT the same as fundable.** \`relayed_funding_available\` says whether \`POST ${apiRoutes.agent.tasks}\` can fund a task on that chain; where it is false, the post answers **503** \`RELAY_UNAVAILABLE\`.`,
          '**Read this before choosing `chain_id` or `asset`.** Both are shape-checked rather than enumerated, because THIS is the list — so pick a chain whose `relayed_funding_available` is true.',
          'On testnets, `faucet_url` is where the test USDC comes from.',
        ),
      tags: ['platform'],
      responses: { '200': { description: 'The enabled chains and their enabled assets', content: json(ref('ChainRegistry')) } },
    },
  },
}
