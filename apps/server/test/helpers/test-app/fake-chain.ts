/**
 * The harness's ONE substitution: a fake chain registry, so no test ever
 * depends on devnet RPC. Everything else in the app under test is real —
 * real db/auth/queue plugins, real autoloaded routes, the production error
 * envelope.
 *
 * `./env` first: FAKE_SOLANA_PROGRAM below reads process.env at module init,
 * so the stubs have to have run (see env.ts on why that ordering is explicit
 * rather than implicit).
 */
import './env'
import { TENDA_RELAY_SCHEME, type RelayTerms } from '@tenda/shared'
import { FIXTURE_APPROVAL_WINDOW_SECONDS } from '@tenda/shared/testing'
import type {
  BuildTxArgs,
  ChainAdapter,
  ChainRegistry,
  EscrowRelay,
  RelayedCreateArgs,
  UnsignedTx,
} from '@server/chains/types'

/**
 * Every buildTx call the fake adapters received, newest last. The routes
 * decide WHAT gets baked (e.g. assign's `worker_address`) and the fake
 * returns a constant, so this capture is the only way an integration test
 * can assert the route → builder handoff. Cleared by `resetDb` alongside the
 * rows it describes.
 */
export const capturedBuilds: BuildTxArgs[] = []

/**
 * Chain/asset every harness escrow rides on (re-seeded by `resetDb`).
 * USDC_SOL is the gig-eligible asset for solana:devnet (assertGigAsset).
 */
export const TEST_CHAIN_ID = 'solana:devnet'
export const TEST_ASSET = 'USDC_SOL'
export const TEST_NATIVE_ASSET = 'SOL_DEVNET'

/**
 * A SECOND registered chain, so cross-chain behaviour (the `chain_id` list
 * filter) can be proven to discriminate rather than just "not crash".
 * Registered in the fake registry always — a registered-but-unseeded chain
 * is exactly the state that must return an EMPTY page rather than a 400.
 * Its DB rows are opt-in via `seedAltChain`, keeping the single-chain
 * expectations of the DB-driven suites (e.g. platform-chains) untouched.
 */
// 0G Galileo, a real manifest EVM testnet with the same relay capabilities the
// agent flows need (a gig asset carrying permit + EIP-3009). It was Base Sepolia
// until Base was PAUSED (2026-10-02): a paused chain refuses the very creates
// these fixtures exist to make, so the fixture moved to a chain users can use.
export const TEST_CHAIN_ID_ALT = 'eip155:16602'
export const TEST_ASSET_ALT = 'USDC_0G'

/**
 * A chain that is PAUSED (Base Sepolia, 2026-10-02) yet still carries an adapter.
 * The registry keeps building a paused chain's adapter so an escrow already on it
 * resolves, settles and is listened to, and the Alchemy webhook (the paymaster
 * chain's) still reaches it. Registered LAST: nothing may displace Solana first.
 */
export const PAUSED_CHAIN_ID = 'eip155:84532'

/** A well-formed CAIP-2 id that is NOT in the registry — the 400 path. */
export const UNREGISTERED_CHAIN_ID = 'solana:mainnet'

/** Stable dummy unsigned tx — routes only relay it, never decode it. */
export const FAKE_UNSIGNED: UnsignedTx = {
  kind: 'solana-tx',
  tx_base64: Buffer.from('fake-tx').toString('base64'),
  recent_blockhash: 'FakeBlockhash1111111111111111111111111111111',
  last_valid_block_height: 1,
}

/**
 * Signature value the fake adapter treats as INVALID — lets wallet-auth
 * tests exercise the 401 path deterministically (every other signature
 * string verifies). Exported so tests reference the sentinel, not a literal.
 */
export const FAKE_BAD_SIGNATURE = 'sig:invalid'

/** Fake chain's configured dispute-resolution authority (a valid base58). */
export const FAKE_DISPUTE_AUTHORITY = '4Nd1mYvK4Pm1x2HCmzCx5GQDV9KbpMK128bxgL5dVDU1'
/** What the fake adapters report as their escrow program/contract. */
export const FAKE_SOLANA_PROGRAM = process.env.SOLANA_PROGRAM_ID ?? ''
export const FAKE_EVM_ESCROW = `0x${'f1'.repeat(20)}`
/**
 * The review window every fake adapter reports (#148): the shared seam's
 * value, so the harness and every client fixture built from
 * `registryEntryDefaults` agree on one number rather than two copies of it.
 */
export const FAKE_APPROVAL_WINDOW_SECONDS = FIXTURE_APPROVAL_WINDOW_SECONDS

/** What the fake relay reports as the relayer hot wallet. */
export const FAKE_RELAYER_ADDRESS = `0x${'ee'.repeat(20)}`
/** The tx reference the fake relay "broadcasts". */
export const FAKE_RELAYED_TX_REF = `0x${'5e'.repeat(32)}`

/**
 * Every relay call the fake received (quote and relay alike), newest last —
 * the only way the fund-route suite can assert what the route handed the
 * adapter. Cleared by `resetDb` with the rows it describes.
 */
export const capturedRelays: Array<{ op: 'quote' | 'relay'; args: RelayedCreateArgs }> = []

/**
 * Relayed funding on the ALT (eip155) fake only: the terms are a constant
 * shape and `relay` answers a constant reference, so the route's contract
 * (402 envelope, header handling, attempt recording, 503 without a relay) is
 * what the suite measures — the artifact checks are the adapters' own unit
 * suites. The Solana fake deliberately has NO relay: that is the 503 path.
 */
function fakeRelay(chain_id: string): EscrowRelay {
  return {
    relayer_address: FAKE_RELAYER_ADDRESS,
    async quote(args) {
      capturedRelays.push({ op: 'quote', args })
      const terms: RelayTerms = {
        scheme: TENDA_RELAY_SCHEME,
        network: chain_id,
        asset: `0x${'a5'.repeat(20)}`,
        asset_id: args.payload.asset,
        amount_raw: args.payload.amount_raw,
        pay_to: FAKE_EVM_ESCROW,
        escrow_id: args.payload.escrow_id,
        max_timeout_seconds: 600,
        expires_at_unix: Math.floor(Date.now() / 1000) + 600,
        payment: {
          kind: 'eip155-authorization',
          creator: args.creator_address,
          create_params: {
            escrowId: `0x${args.payload.escrow_id.replace(/-/g, '')}`,
            kind: 0,
            asset: `0x${'a5'.repeat(20)}`,
            amount: args.payload.amount_raw,
            assignedCounterparty: `0x${'00'.repeat(20)}`,
            acceptDeadline: String(args.payload.accept_deadline_unix),
            completionDuration: String(args.payload.completion_duration_seconds),
            disputeBond: args.payload.dispute_bond_raw,
            isSeeker: args.payload.is_seeker,
            requiresApproval: args.payload.requires_approval,
            unassignWindowSeconds: String(args.payload.unassign_window_seconds),
          },
          typed_data: {
            types: { EIP712Domain: [], ReceiveWithAuthorization: [] },
            primaryType: 'ReceiveWithAuthorization',
            domain: { name: 'USDC', version: '2', chainId: 16602, verifyingContract: `0x${'a5'.repeat(20)}` },
            message: {
              from: args.creator_address,
              to: FAKE_EVM_ESCROW,
              value: args.payload.amount_raw,
              validAfter: '0',
              validBefore: '0',
              nonce: `0x${'00'.repeat(32)}`,
            },
          },
        },
      }
      return terms
    },
    async relay(args) {
      capturedRelays.push({ op: 'relay', args })
      return { tx_ref: FAKE_RELAYED_TX_REF }
    },
  }
}

function fakeAdapter(chain_id: string, namespace: 'solana' | 'eip155' = 'solana'): ChainAdapter {
  const unimplemented = (op: string) => () => {
    throw new Error(`fake adapter: ${op} not used by HTTP routes under test`)
  }
  return {
    namespace,
    chain_id,
    // Stand-in dispute authority so resolve-tx builds under test (the real
    // value rides each chain's secret).
    disputeAuthority: FAKE_DISPUTE_AUTHORITY,
    // What /v1/platform/chains serves as `escrow_address`. On the adapter
    // because that is the contract the server actually transacts with — the
    // seeded `chains.escrow_program` column is no longer the source.
    escrowAddress: namespace === 'solana' ? FAKE_SOLANA_PROGRAM : FAKE_EVM_ESCROW,
    approvalWindowSeconds: async () => FAKE_APPROVAL_WINDOW_SECONDS,
    getFees: async () => ({ fee_bps: 250, seeker_fee_bps: 100 }),
    buildTx: async (args) => {
      capturedBuilds.push(args)
      return FAKE_UNSIGNED
    },
    verifyTx: unimplemented('verifyTx'),
    // Offline stand-in for tweetnacl/viem sig verify: any signature passes
    // except the explicit bad sentinel (the wallet-auth 401 path).
    verifyAuthSig: async ({ signature }) => signature !== FAKE_BAD_SIGNATURE,
    fetchEscrowState: unimplemented('fetchEscrowState'),
    computeFee: unimplemented('computeFee'),
    ...(namespace === 'eip155' ? { relay: fakeRelay(chain_id) } : {}),
  }
}

/**
 * Exported for `./app` and for `realEvmRegistry` below — it was module-private
 * before the split (#44) and is deliberately NOT re-exported from the barrel:
 * no suite builds its own registry, they get one already decorated on the app.
 */
export function fakeRegistry(substitute?: { chain_id: string; adapter: ChainAdapter }): ChainRegistry {
  // Solana FIRST: `reconcile-escrows` falls back to `list()[0]` and the
  // helius webhook / listeners plugin pick the first solana adapter, so
  // insertion order is load-bearing — the alt chain must never displace it.
  const adapters = new Map<string, ChainAdapter>([
    [TEST_CHAIN_ID, fakeAdapter(TEST_CHAIN_ID)],
    [TEST_CHAIN_ID_ALT, fakeAdapter(TEST_CHAIN_ID_ALT, 'eip155')],
    [PAUSED_CHAIN_ID, fakeAdapter(PAUSED_CHAIN_ID, 'eip155')],
  ])
  // `set` on an existing key REPLACES the value and KEEPS the position, so a
  // substitution cannot reorder the map and break the rule just above.
  if (substitute !== undefined) adapters.set(substitute.chain_id, substitute.adapter)
  return {
    get(chain_id) {
      const a = adapters.get(chain_id)
      if (a === undefined) throw new Error(`no adapter registered for chain_id '${chain_id}'`)
      return a
    },
    has: (chain_id) => adapters.has(chain_id),
    list: () => [...adapters.values()],
    // Offline stand-in for tweetnacl/viem sig verify (namespace-dispatched, like
    // the real registry): any signature passes except the explicit bad sentinel
    // (the wallet-auth 401 path). Works for unprovisioned chains too.
    verifyAuthSig: async (_chain_id, { signature }) => signature !== FAKE_BAD_SIGNATURE,
  }
}

/**
 * The harness registry plus ONE more fake adapter under any chain id — how a
 * suite gets a chain the two defaults are not (a MAINNET, for the registry's
 * `network_kind`) without building a registry of its own: the insertion-order
 * rule above stays here, and a new key is appended, never moved ahead.
 */
export function fakeRegistryPlus(
  chain_id: string,
  namespace: 'solana' | 'eip155',
  overrides: Partial<ChainAdapter> = {},
): ChainRegistry {
  return fakeRegistry({ chain_id, adapter: { ...fakeAdapter(chain_id, namespace), ...overrides } })
}

/**
 * The harness registry with the eip155 chain's adapter replaced by a REAL one
 * (#109's recorder, the only caller).
 *
 * Everything else stays fake — including `verifyAuthSig`, so wallet auth is
 * still the offline stand-in every other suite uses. What becomes real is the
 * one thing the recording depends on: `relay.quote`, whose terms must carry
 * the token's actual EIP-712 domain, populated `types` and a nonce the
 * contract agrees with. The fake relay answers with empty types and a zero
 * nonce, which is correct for asserting route behaviour and would be a lie as
 * a published example.
 *
 * A function rather than an exported `fakeRegistry` because the insertion-order
 * rule above is load-bearing and belongs to this file, not to its callers.
 */
export function realEvmRegistry(adapter: ChainAdapter): ChainRegistry {
  return fakeRegistry({ chain_id: TEST_CHAIN_ID_ALT, adapter })
}
