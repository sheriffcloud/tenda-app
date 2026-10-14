/**
 * On-chain + DB proof that the gas seed actually delivers — for EVERY seeded
 * namespace, not just Solana (#53b item 3).
 *
 * For each `gas_grants` row it asserts the recorded `tx_ref` is a REAL,
 * successful native transfer of the recorded amount, FROM the wallet the grant
 * says paid it, TO the wallet the grant says was paid. That is: the money left
 * the hot wallet, reached the user, and the row is not a stranded placeholder.
 *
 *   pnpm --filter tenda-server verify:gas-seed            # every seeded chain
 *   pnpm --filter tenda-server verify:gas-seed -- --user <uuid>
 *
 * Needs DATABASE_URL plus the `CHAIN_*` secrets for whichever chains carry a
 * seed. Config is resolved live from those + the manifest, so this cannot drift
 * from what the seeder wrote or the sender signs. Read-only: zero writes, zero
 * transfers.
 *
 * It used to be Solana-only, and its own error text said `CHAIN_SOLANA_*`, so
 * the EVM rail had no on-chain proof at all — the one thing this script exists
 * to provide.
 */

import 'dotenv/config'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { and, eq, inArray } from 'drizzle-orm'
import { Connection, type Finality } from '@solana/web3.js'
import { createPublicClient, http } from 'viem'
import { chains } from '@tenda/shared/db/schema/chains'
import { gas_grants } from '@tenda/shared/db/schema/gas-seed'
import { loadConfig } from '@server/config'
import { getChainSecrets } from '@server/chains/secrets'
import { commitmentFor } from '@server/chains/solana/rpc'
import { checkGrant, type FetchParsedTx } from './solana'
import { checkEvmGrant, type FetchEvmTx } from './evm'
import { parseUserFilter, type CheckResult, type GrantRow } from './shared'

export { parseSystemTransfer, checkGrant } from './solana'
export type { FetchParsedTx, ParsedTxView } from './solana'
export { checkEvmGrant } from './evm'
export type { FetchEvmTx, EvmTxView } from './evm'
export { parseUserFilter, expectedFunder, unfinishedResult } from './shared'
export type { CheckResult, GrantRow } from './shared'

type Db = ReturnType<typeof drizzle>

/** Every wallet this user holds on a namespace — for the "did it reach them?" note. */
function walletsForOn(db: Db, chain_ns: 'solana' | 'eip155') {
  const cache = new Map<string, Set<string>>()
  return async (user_id: string): Promise<Set<string>> => {
    const hit = cache.get(user_id)
    if (hit !== undefined) return hit
    const { user_wallets } = await import('@tenda/shared/db/schema/identity')
    const rows = await db
      .select({ address: user_wallets.address })
      .from(user_wallets)
      .where(and(eq(user_wallets.user_id, user_id), eq(user_wallets.chain_ns, chain_ns)))
    const set = new Set(rows.map((r) => r.address))
    cache.set(user_id, set)
    return set
  }
}

async function verifyChain(
  db: Db,
  chain: { id: string; namespace: 'solana' | 'eip155'; funder: string; rpcUrl: string },
  grants: GrantRow[],
): Promise<CheckResult[]> {
  if (chain.namespace === 'solana') {
    // `commitmentFor` yields 'confirmed' | 'finalized', both Finality; its
    // declared type is the wider Commitment, so it is narrowed for
    // getParsedTransaction.
    const commitment: Finality = commitmentFor(chain.id) === 'finalized' ? 'finalized' : 'confirmed'
    const conn = new Connection(chain.rpcUrl, commitment)
    const fetchTx: FetchParsedTx = async (tx_ref) => {
      const tx = await conn.getParsedTransaction(tx_ref, { commitment, maxSupportedTransactionVersion: 0 })
      return tx === null ? null : { err: tx.meta?.err ?? null, instructions: tx.transaction.message.instructions }
    }
    const wallets = walletsForOn(db, 'solana')
    return Promise.all(grants.map((g) => checkGrant(fetchTx, g, chain.funder, wallets)))
  }

  const pub = createPublicClient({ transport: http(chain.rpcUrl) })
  const fetchTx: FetchEvmTx = async (tx_ref) => {
    try {
      const [tx, receipt] = await Promise.all([
        pub.getTransaction({ hash: tx_ref as `0x${string}` }),
        pub.getTransactionReceipt({ hash: tx_ref as `0x${string}` }),
      ])
      return { status: receipt.status, from: receipt.from, to: tx.to, value: tx.value }
    } catch {
      // viem throws for an unknown hash rather than returning null. An unknown
      // transaction is a FINDING, not a crash — the caller reports it as one.
      return null
    }
  }
  return Promise.all(grants.map((g) => checkEvmGrant(fetchTx, g, chain.funder)))
}

async function main(): Promise<void> {
  const userFilter = parseUserFilter(process.argv.slice(2))
  const config = loadConfig()
  const secrets = getChainSecrets()

  // Every chain that CARRIES a seed, whatever its namespace. The old script
  // resolved one Solana chain and refused if there was none.
  const client = postgres(config.DATABASE_URL, { max: 1 })
  try {
    const db = drizzle(client)
    const chainRows = await db
      .select({
        id: chains.id,
        namespace: chains.namespace,
        funder: chains.gas_seed_wallet_address,
        amount: chains.gas_seed_amount_raw,
      })
      .from(chains)
      .where(eq(chains.is_enabled, true))

    const seeded = chainRows.flatMap((c) => {
      if (c.funder === null || c.amount === null) return []
      const secret = secrets.get(c.id)
      if (secret === undefined) return []
      return [{ id: c.id, namespace: c.namespace, funder: c.funder, rpcUrl: secret.rpcUrl }]
    })

    if (seeded.length === 0) {
      console.log('No chain carries a funded gas seed — nothing to verify.')
      console.log('A chain qualifies once gas_seed_amount_raw AND gas_seed_wallet_address are set,')
      console.log('which db:seed writes from the manifest amount + CHAIN_<ID>_GAS_SEED_KEY.')
      return
    }

    // NOT cast to GrantRow[], deliberately — the inferred row type IS the check.
    //
    // It used to end `)) as GrantRow[]`, and that cast hid a real break: when
    // #58 added `status` to GrantRow, this select did not gain the column, so
    // every `grant.status` was `undefined` at runtime. `unfinishedResult`
    // compares against three literals and falls through to the last branch, so
    // the audit would have reported EVERY grant as "UNRESOLVED — settle by hand"
    // and verified nothing on-chain. The unit suites could not see it: they
    // build GrantRow fixtures directly and never run this query. Letting the
    // compiler match the select against the interface makes the next added
    // column a build error instead of a silent one.
    const allGrants: GrantRow[] = await db
      .select({
        user_id: gas_grants.user_id,
        chain_id: gas_grants.chain_id,
        amount_raw: gas_grants.amount_raw,
        status: gas_grants.status,
        tx_ref: gas_grants.tx_ref,
        funder_address: gas_grants.funder_address,
        wallet_address: gas_grants.wallet_address,
        granted_at: gas_grants.granted_at,
      })
      .from(gas_grants)
      .where(
        userFilter === undefined
          ? inArray(gas_grants.chain_id, seeded.map((c) => c.id))
          : and(
              inArray(gas_grants.chain_id, seeded.map((c) => c.id)),
              eq(gas_grants.user_id, userFilter),
            ),
      )

    let passed = 0
    let total = 0
    for (const chain of seeded) {
      const grants = allGrants.filter((g) => g.chain_id === chain.id)
      console.log(`\n${chain.id}  (${chain.namespace})`)
      console.log(`  seed wallet : ${chain.funder}`)
      console.log(`  grants      : ${grants.length}`)
      if (grants.length === 0) continue

      for (const result of await verifyChain(db, chain, grants)) {
        total += 1
        if (result.ok) passed += 1
        console.log(`  ${result.ok ? '✓' : '✗'} ${result.user_id}  ${result.detail}`)
        console.log(`      tx: ${result.tx_ref}`)
      }
    }

    if (total === 0) {
      console.log('\nNo grants to verify yet.')
      return
    }
    console.log(`\n${passed}/${total} grants verified on-chain.`)
    if (passed < total) {
      process.exitCode = 1
    } else {
      console.log('✓ PROVEN: every grant is a real, funded transfer from its recorded seed wallet.')
    }
  } finally {
    await client.end()
  }
}

// Execute only when run directly, not on import — the exported helpers above
// are consumed by the unit tests.
if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  })
}
