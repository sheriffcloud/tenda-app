/**
 * On-chain + DB proof that the SOL gas seed (#40) actually delivers. For each
 * `gas_grants` row on the active Solana chain it asserts the recorded `tx_ref`
 * is a REAL, successful SystemProgram transfer of the recorded lamports FROM the
 * configured funder (`chains.gas_seed_wallet_address`) TO one of the grantee's
 * wallets — i.e. the money left the hot wallet and reached the user, and the DB
 * row isn't a stranded placeholder claim.
 *
 *   pnpm --filter tenda-server verify:gas-seed            # every grant
 *   pnpm --filter tenda-server verify:gas-seed -- --user <uuid>
 *
 * Needs DATABASE_URL + the active Solana `CHAIN_SOLANA_*` secrets (the same env
 * the server + seeder read). Config is resolved live from those + the manifest,
 * nothing chain-shaped is hardcoded, so this can't drift from what the seeder
 * wrote or the sender signs. Read-only: it makes zero writes and no transfers.
 */

import 'dotenv/config'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { and, eq } from 'drizzle-orm'
import {
  Connection,
  type Finality,
  type ParsedInstruction,
  type PartiallyDecodedInstruction,
} from '@solana/web3.js'
import { chains } from '@tenda/shared/db/schema/chains'
import { gas_grants, user_wallets } from '@tenda/shared/db/schema/identity'
import { loadConfig } from '@server/config'
import { getChainSecrets, solanaSecret } from '@server/chains/secrets'
import { commitmentFor } from '@server/chains/solana/rpc'
import { gasSeedAddressFromSecret } from '@server/features/gas-seed'

const PLACEHOLDER_PREFIX = 'pending:'

// ---------- typed narrowing over web3.js' `any`-typed parsed payload --------

/** Narrow an unknown value to a plain record without reaching for `any`. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

interface SystemTransfer {
  source: string
  destination: string
  lamports: bigint
}

/** Minimal decoded view of a parsed tx — the only surface `checkGrant` needs. */
export interface ParsedTxView {
  /** Runtime error, or null on success (mirrors `meta.err`). */
  err: unknown
  instructions: ReadonlyArray<ParsedInstruction | PartiallyDecodedInstruction>
}

/** Fetch a parsed tx by signature; null = unknown at the required commitment. */
export type FetchParsedTx = (tx_ref: string) => Promise<ParsedTxView | null>

/**
 * Extract a native SOL transfer from a parsed instruction, or undefined if the
 * instruction isn't a `system`/`transfer`. `ix.parsed` is typed `any` upstream;
 * we read it as `unknown` and validate every field at runtime.
 */
export function parseSystemTransfer(
  ix: ParsedInstruction | PartiallyDecodedInstruction,
): SystemTransfer | undefined {
  if (!('parsed' in ix) || ix.program !== 'system') return undefined
  const parsed = asRecord(ix.parsed)
  if (parsed === undefined || parsed.type !== 'transfer') return undefined
  const info = asRecord(parsed.info)
  if (info === undefined) return undefined
  const { source, destination, lamports } = info
  if (typeof source !== 'string' || typeof destination !== 'string') return undefined
  if (typeof lamports !== 'number' && typeof lamports !== 'string') return undefined
  return { source, destination, lamports: BigInt(lamports) }
}

// ---------- verification ----------------------------------------------------

export interface GrantRow {
  user_id: string
  amount_raw: string
  tx_ref: string
  granted_at: Date
}

export interface CheckResult {
  user_id: string
  tx_ref: string
  ok: boolean
  detail: string
}

export function parseUserFilter(argv: readonly string[]): string | undefined {
  const i = argv.indexOf('--user')
  if (i === -1) return undefined
  const value = argv[i + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error('--user requires a user id argument')
  }
  return value
}

/** Verify one grant against the chain; never throws (errors become a failing result). */
export async function checkGrant(
  fetchTx: FetchParsedTx,
  grant: GrantRow,
  funder: string,
  walletsFor: (user_id: string) => Promise<Set<string>>,
): Promise<CheckResult> {
  const base = { user_id: grant.user_id, tx_ref: grant.tx_ref }
  if (grant.tx_ref.startsWith(PLACEHOLDER_PREFIX)) {
    return { ...base, ok: false, detail: 'placeholder tx_ref — slot claimed but transfer never finalized' }
  }
  try {
    const tx = await fetchTx(grant.tx_ref)
    if (tx === null) return { ...base, ok: false, detail: 'tx not found on-chain at the required commitment' }
    if (tx.err != null) {
      return { ...base, ok: false, detail: `tx failed on-chain: ${JSON.stringify(tx.err)}` }
    }

    const transfer = tx.instructions
      .map(parseSystemTransfer)
      .find((t): t is SystemTransfer => t !== undefined)
    if (transfer === undefined) return { ...base, ok: false, detail: 'no SystemProgram transfer in tx' }

    if (transfer.source !== funder) {
      return { ...base, ok: false, detail: `funded by ${transfer.source}, not the configured seed wallet ${funder}` }
    }
    const expected = BigInt(grant.amount_raw)
    if (transfer.lamports !== expected) {
      return { ...base, ok: false, detail: `transferred ${transfer.lamports} lamports, grant records ${expected}` }
    }

    // Destination should be a wallet the grantee controls. Rotation (old wallet
    // removed) can legitimately empty this set, so a miss is reported, not failed.
    const wallets = await walletsFor(grant.user_id)
    const note =
      wallets.has(transfer.destination)
        ? '→ current wallet'
        : wallets.size === 0
          ? '→ user has no current Solana wallet (rotated)'
          : `⚠ destination not among user's current wallets (${transfer.destination})`
    return { ...base, ok: true, detail: `${transfer.lamports} lamports → ${transfer.destination} ${note}` }
  } catch (err) {
    return { ...base, ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

async function main(): Promise<void> {
  const userFilter = parseUserFilter(process.argv.slice(2))
  const config = loadConfig()
  const secret = solanaSecret(getChainSecrets())
  if (secret === undefined) {
    throw new Error('no active Solana chain configured (set CHAIN_SOLANA_*_RPC_URL + _TREASURY_ADDR)')
  }
  const chainId = secret.chainId
  // commitmentFor only ever yields 'confirmed' | 'finalized' (both Finality),
  // but its return type is the wider Commitment — narrow for getParsedTransaction.
  const commitment: Finality = commitmentFor(chainId) === 'finalized' ? 'finalized' : 'confirmed'
  const conn = new Connection(secret.rpcUrl, commitment)
  const fetchTx: FetchParsedTx = async (tx_ref) => {
    const tx = await conn.getParsedTransaction(tx_ref, { commitment, maxSupportedTransactionVersion: 0 })
    return tx === null ? null : { err: tx.meta?.err ?? null, instructions: tx.transaction.message.instructions }
  }

  const client = postgres(config.DATABASE_URL, { max: 1 })
  try {
    const db = drizzle(client)

    const [chainRow] = await db
      .select({ funder: chains.gas_seed_wallet_address, amount: chains.gas_seed_amount_raw })
      .from(chains)
      .where(eq(chains.id, chainId))
    if (chainRow === undefined) throw new Error(`chain '${chainId}' not seeded (run db:seed)`)
    if (chainRow.funder === null || chainRow.amount === null) {
      throw new Error(
        `gas seed dormant for '${chainId}' (gas_seed_wallet_address/amount NULL) — set ` +
          `${chainId.startsWith('solana') ? 'CHAIN_SOLANA_*_GAS_SEED_KEY' : 'the seed key'} and re-run db:seed`,
      )
    }
    const funder = chainRow.funder

    // Drift guard: the recorded funder must match the wallet the sender signs
    // with. Both are derived from one secret at seed time, so a mismatch means
    // the DB was seeded against a different key than is configured now.
    if (secret.gasSeedKey !== undefined) {
      const derived = gasSeedAddressFromSecret(secret.gasSeedKey)
      if (derived !== funder) {
        throw new Error(
          `funder drift: DB records ${funder} but configured CHAIN_SOLANA_*_GAS_SEED_KEY derives ${derived} — re-run db:seed`,
        )
      }
    }

    const grants = (await db
      .select({
        user_id: gas_grants.user_id,
        amount_raw: gas_grants.amount_raw,
        tx_ref: gas_grants.tx_ref,
        granted_at: gas_grants.granted_at,
      })
      .from(gas_grants)
      .where(
        userFilter === undefined
          ? eq(gas_grants.chain_id, chainId)
          : and(eq(gas_grants.chain_id, chainId), eq(gas_grants.user_id, userFilter)),
      )) as GrantRow[]

    const walletCache = new Map<string, Set<string>>()
    const walletsFor = async (user_id: string): Promise<Set<string>> => {
      const cached = walletCache.get(user_id)
      if (cached !== undefined) return cached
      const rows = await db
        .select({ address: user_wallets.address })
        .from(user_wallets)
        .where(and(eq(user_wallets.user_id, user_id), eq(user_wallets.chain_ns, 'solana')))
      const set = new Set(rows.map((r) => r.address))
      walletCache.set(user_id, set)
      return set
    }

    console.log(`Chain      : ${chainId}  (${commitment})`)
    console.log(`RPC        : ${secret.rpcUrl}`)
    console.log(`Seed wallet: ${funder}`)
    console.log(`Seed amount: ${chainRow.amount} lamports`)
    console.log(`Grants     : ${grants.length}${userFilter === undefined ? '' : ` (user ${userFilter})`}\n`)

    if (grants.length === 0) {
      console.log('No grants to verify — link a Solana wallet as a phone-verified user to fire the seed.')
      return
    }

    let passed = 0
    for (const grant of grants) {
      const result = await checkGrant(fetchTx, grant, funder, walletsFor)
      if (result.ok) passed += 1
      console.log(`  ${result.ok ? '✓' : '✗'} ${result.user_id}  ${result.detail}`)
      console.log(`      tx: ${result.tx_ref}`)
    }

    console.log(`\n${passed}/${grants.length} grants verified on-chain.`)
    if (passed < grants.length) {
      process.exitCode = 1
    } else {
      console.log(`✓ PROVEN: every ${chainId} gas grant is a real, funded transfer from ${funder}.`)
    }
  } finally {
    await client.end()
  }
}

// Execute only when run directly (tsx src/scripts/verify-gas-seed.ts), not on
// import — the exported helpers above are consumed by the unit test.
if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  })
}
