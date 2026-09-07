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
export const TEST_CHAIN_ID_ALT = 'eip155:84532'
export const TEST_ASSET_ALT = 'USDC_BASE'

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
            domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: `0x${'a5'.repeat(20)}` },
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
 * Exported for `./app` only — it was module-private before the split (#44) and
 * is deliberately NOT re-exported from the barrel: no suite builds its own
 * registry, they get one already decorated on the app.
 */
export function fakeRegistry(): ChainRegistry {
  // Solana FIRST: `reconcile-escrows` falls back to `list()[0]` and the
  // helius webhook / listeners plugin pick the first solana adapter, so
  // insertion order is load-bearing — the alt chain must never displace it.
  const adapters = new Map<string, ChainAdapter>([
    [TEST_CHAIN_ID, fakeAdapter(TEST_CHAIN_ID)],
    [TEST_CHAIN_ID_ALT, fakeAdapter(TEST_CHAIN_ID_ALT, 'eip155')],
  ])
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
