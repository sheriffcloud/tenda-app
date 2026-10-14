/**
 * The agent card itself — a pure function from "what we know" to the JSON
 * served at `/.well-known/agents/<address>.json`.
 *
 * WHAT THIS DOCUMENT IS FOR. An ERC-8004 Identity Registry mint takes a URI as
 * an argument and commits it on-chain; this is what that URI resolves to. A
 * reader who has only an agent's address — from a registry on any chain — uses
 * it to discover what the agent can do and where to reach it.
 *
 * IT IS AN ERC-8004 REGISTRATION FILE FIRST, a Tenda document second (#105).
 * The first cut of this card (#84) was a Tenda-invented shape that satisfied
 * none of the standard's required fields, which meant the exact document a
 * fresh mint would point at could not validate. `type`, `name`, `description`
 * and `image` now always appear, and the endpoint list is an ARRAY of typed
 * entries rather than an object keyed by name — in both spellings the two
 * sources use, for the reason set out next.
 *
 * TWO SOURCES THAT DISAGREE, so this satisfies BOTH — verified 2026-09-05.
 *
 *   EIP-8004   `services:  [{ name, endpoint }]`, and it is REQUIRED.
 *              `image` required, for ERC-721 app compatibility.
 *   Celo docs  `endpoints: [{ type, url }]` plus `{ type: 'wallet', address,
 *              chainId }`. `image` optional.
 *
 * Those are different SHAPES, not one field under two names, so the card emits
 * both — built from one internal list below, which is what stops them drifting.
 *
 * WHERE THEY CONFLICT ON A VALUE, the EIP wins, because the scanner enforces
 * it. `type` is the case: Celo's example says "Agent", the EIP says a
 * registration-format URI, and 8004scan rejected the minted token for the
 * former. A shape can be emitted twice; a single field's value cannot.
 * A reader that knows only the EIP finds `services`; Celo's own tooling, which
 * this mints against, finds `endpoints` with the wallet entries the EIP shape
 * has nowhere to put. `image` is always emitted: including an optional field
 * costs one line, omitting a required one fails validation.
 *
 * OUR OWN FIELDS sit alongside (`schema`, `address`, `registered`,
 * `capabilities`). The EIP does not explicitly permit extra top-level fields —
 * it is silent, not permissive, and this comment previously overstated that.
 * They are kept because they are additive rather than contradictory, and
 * because Celo's own documented example already carries a wallet entry the EIP
 * shape does not define. If a validator ever rejects unknown keys, these are
 * the four to drop, and dropping them costs no required field.
 *
 * STABLE FACTS ONLY, and that is a constraint rather than a style. The URI is
 * committed on-chain, so anything that changes per interaction cannot live
 * here: the card links to reputation, it never states a score. Putting a score
 * in would mean a chain write per review (#82 exists for that question).
 *
 * KEYED BY ADDRESS, NEVER BY tokenId. TokenIds are per-registry and per-chain —
 * token #7 on Celo and token #7 on Base are unrelated agents — so a tokenId key
 * produces a different URL per chain and three cards that drift. The address is
 * the same on every EVM chain, exists before any registration, and is already
 * how Tenda identifies an agent (wallet-born accounts, #19).
 */

import { APP_INFO, PROOF_TYPES, evmChainNumericId, isEvmChainId } from '@tenda/shared'
import type { ProofType } from '@tenda/shared'

/**
 * The value EIP-8004 gives the `type` field: a URI naming the registration
 * format, not a human word. Kept as a named constant so the tests assert
 * against the same string the card emits.
 */
export const REGISTRATION_TYPE = 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1'

/** What the store found, or null when this address is not a Tenda agent. */
export interface AgentIdentity {
  user_id: string
  name: string
  /** `users.bio` — the agent's own description, when it has written one. */
  description: string | null
  /** `users.avatar_url` — the agent's own image, when it has uploaded one. */
  image: string | null
}

/**
 * A wallet this agent controls, one entry per chain Tenda settles on.
 *
 * `chainId` is a NUMBER, per Celo's documented example, and is derived from
 * the manifest's CAIP-2 id rather than written down a second time.
 */
export interface WalletEndpoint {
  type: 'wallet'
  address: string
  chainId: number
}

/**
 * Service names, and the first two are NOT free labels.
 *
 * ERC-8004 draws `name` from a vocabulary — `web`, `A2A`, `MCP`, `OASF`, `ENS`,
 * `DID`, `email` — and although the spec says the list is customizable, a
 * reader that knows only those sees a card with no recognised service at all.
 * 8004scan says exactly that out loud: "Metadata does not declare MCP, A2A,
 * OASF, web, email, ENS, DID, or agent URL services." The first cut of this
 * card (#105) declared only `tasks` and `openapi`, which are ours, so every
 * scanner read it as offering nothing.
 *
 * `web` and `email` are declared because both are TRUE and public. `A2A` and
 * `MCP` are deliberately NOT: we serve neither protocol, and a claim in a
 * document committed on-chain is not a cheap thing to withdraw. Serving a real
 * A2A card is worth doing — it is filed, not faked.
 */
export type AgentServiceType = 'web' | 'email' | 'tasks' | 'openapi' | 'reputation'

/** Celo's documented shape. */
export interface ServiceEndpoint {
  type: AgentServiceType
  url: string
}

/** EIP-8004's own shape for the same fact — `services`, not `endpoints`. */
export interface EipService {
  name: AgentServiceType
  endpoint: string
}

export type AgentCardEndpoint = WalletEndpoint | ServiceEndpoint

export interface AgentCard {
  // --- ERC-8004 required ---------------------------------------------------
  /**
   * The registration-format URI, NOT the word "Agent".
   *
   * Celo's docs example says `"type": "Agent"` and that is what this card
   * shipped first; 8004scan rejected the minted token with
   * `[WA002] Invalid type field value: Agent`. The EIP's own example is this
   * URI, and the SCANNER is the arbiter — it is what a judge or a registry
   * actually runs. Where the two sources conflict on a value (as opposed to a
   * shape, where both can be emitted), the EIP wins.
   */
  type: typeof REGISTRATION_TYPE
  /** Never empty: an unregistered address is named after itself. */
  name: string
  description: string
  image: string

  // --- ERC-8004 required, in the EIP's own spelling -------------------------
  /**
   * The EIP names this array `services` with `{ name, endpoint }` entries, and
   * requires it. Derived from the same list as `endpoints` below, never written
   * twice. Wallets are absent here on purpose: the EIP's service shape has no
   * field for an address or a chain id, and inventing one would be a claim the
   * standard does not define.
   */
  services: EipService[]

  // --- ERC-8004 optional, and true of us -----------------------------------
  /** Celo's spelling of the same endpoints, plus the wallet entries. */
  endpoints: AgentCardEndpoint[]
  /**
   * Only `reputation`, and the omissions are the honest part: we expose
   * standing by reference and run no validation service and no TEE. Claiming
   * either in a document committed on-chain would be a claim we cannot meet.
   */
  supportedTrust: readonly ['reputation']
  /** The task endpoint is 402-gated (#19), which is exactly what this field asks. */
  x402Support: true

  // --- Tenda's own; see the header for why these are kept -------------------
  schema: 'tenda-agent-card/v1'
  /** Canonical lowercase 0x address — the key this document is served under. */
  address: string
  /**
   * Whether this address is a registered Tenda agent.
   *
   * FALSE IS A VALID, SERVABLE CARD, not an error. The URI is committed at MINT
   * time, which can precede any Tenda-side registration — so a 404 here would
   * mean the on-chain pointer is broken during exactly the window the agent is
   * being created in. A minimal card resolves, and gains its identity fields
   * when the agent registers, with no second transaction.
   */
  registered: boolean
  capabilities: {
    /** Proof kinds a worker may submit, from the shared vocabulary. */
    proof_types: readonly ProofType[]
  }
}

/**
 * `0x1234…cdef` — for the fallback name only.
 *
 * Local rather than shared: `packages/shared/src/wallet/wallet-address.ts`
 * picks WHICH address to show, never how to abbreviate one, and one caller does
 * not earn a shared helper. It stays inside the removable feature directory.
 */
function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/**
 * One wallet endpoint per EVM chain THIS DEPLOYMENT settles on, for one address.
 *
 * The ids come from the caller — the live chain registry, which is built from
 * exactly the `CHAIN_<id>_*` secrets the deployment holds — and NOT from
 * `CHAIN_MANIFEST.status`. That distinction is the whole of #126, and the
 * previous version of this comment got it backwards: `status: 'live'` says
 * TendaEscrow is deployed on that chain SOMEWHERE, which is a fact about the
 * manifest. Whether an agent can transact here is a fact about THIS deployment,
 * and testnet and mainnet are separate deployments — so the manifest reading
 * had the testnet card advertising Celo mainnet and 0G mainnet, in a document
 * whose URI is committed ON-CHAIN at mint. Same mistake as #50, one level down.
 *
 * It still says "this address CAN transact on these chains", never that it has.
 *
 * EVM only: the address is an eip155 one, and naming it under `solana:` would
 * be a different key space and simply false — so a Solana-only deployment
 * correctly emits no wallet endpoint at all.
 */
function deploymentEvmWallets(address: string, chain_ids: readonly string[]): WalletEndpoint[] {
  return chain_ids.filter(isEvmChainId).map((id) => ({
    type: 'wallet',
    address,
    // `evmChainNumericId` THROWS on a malformed id rather than yielding NaN,
    // and `isEvmChainId` above is the same predicate `assertManifestValid`
    // enforces — so the filter, not a null-check, is what makes this total.
    // Filtering rather than asserting is deliberate: a registry carrying a
    // Solana chain is normal, not an error.
    chainId: evmChainNumericId(id),
  }))
}

/**
 * Build the card. Pure — no I/O, no clock, no env read, no manifest read: the
 * whole document is a function of its inputs, which is what lets the deployment's
 * OWN chain set be passed in rather than inferred.
 */
export function buildAgentCard(args: {
  address: string
  api_base_url: string
  identity: AgentIdentity | null
  /**
   * CAIP-2 ids this deployment actually serves — `fastify.chains`, i.e. the
   * chains whose secrets are configured. Non-EVM ids are filtered out, so the
   * caller passes the registry as it is rather than pre-selecting.
   */
  chain_ids: readonly string[]
}): AgentCard {
  const { address, api_base_url: base, identity, chain_ids } = args

  const services: ServiceEndpoint[] = [
    // The vocabulary entries first, so a reader that scans for recognised
    // names finds them without walking our custom ones.
    { type: 'web', url: APP_INFO.external.website },
    // The EIP's own example gives `email` a BARE address, not a mailto: URL.
    // Emitted identically in both arrays: one value cannot disagree with itself.
    { type: 'email', url: APP_INFO.support.email },
    { type: 'tasks', url: `${base}/v1/agent/tasks` },
    { type: 'openapi', url: `${base}/v1/openapi.json` },
  ]
  if (identity !== null) {
    services.push({ type: 'reputation', url: `${base}/v1/users/${identity.user_id}/standing` })
  }

  return {
    type: REGISTRATION_TYPE,
    // `||`, not `??`, throughout: an agent whose name, bio or avatar is stored
    // as the empty string must fall back, not publish a blank required field.
    // `formatFullName` returns '' for an agent with no name at all.
    name: identity?.name || `${APP_INFO.name} agent ${shortAddress(address)}`,
    description: identity?.description || APP_INFO.description,
    image: identity?.image || APP_INFO.external.logo,
    services: services.map((s) => ({ name: s.type, endpoint: s.url })),
    endpoints: [...services, ...deploymentEvmWallets(address, chain_ids)],
    supportedTrust: ['reputation'],
    x402Support: true,
    schema: 'tenda-agent-card/v1',
    address,
    registered: identity !== null,
    capabilities: { proof_types: PROOF_TYPES },
  }
}
