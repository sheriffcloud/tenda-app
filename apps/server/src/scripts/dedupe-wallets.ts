/**
 * One-time cleanup of case-duplicate wallet rows (ops script, NOT a runtime
 * surface):
 *
 *   pnpm dedupe-wallets            # DRY RUN, prints the plan, deletes nothing
 *   pnpm dedupe-wallets -- --apply # actually delete the duplicates
 *
 * Residue of the pre-fix case-SENSITIVE `(chain_ns, address)` dedup: the same
 * EVM wallet could land twice (checksummed + lowercased). The live code now
 * folds case everywhere AND blocks new case-variant links, so this only cleans
 * existing rows. It keeps ONE row per wallet (the primary if any, else the
 * earliest-verified) and deletes the rest by exact PK. Safe: nothing FKs to
 * user_wallets, and a primary row is never the one deleted.
 */

import 'dotenv/config'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { and, eq } from 'drizzle-orm'
import * as schema from '@tenda/shared/db/schema'
import { user_wallets } from '@tenda/shared/db/schema'
import { planWalletDedupe, type WalletRow } from '@server/lib/auth/wallet-dedupe'

async function main(): Promise<void> {
  const apply = process.argv.slice(2).includes('--apply')
  const url = process.env.DATABASE_URL
  if (url === undefined || url === '') {
    console.error('DATABASE_URL is not set')
    process.exitCode = 1
    return
  }

  const client = postgres(url, { max: 1 })
  const db = drizzle(client, { schema })
  try {
    const rows: WalletRow[] = await db
      .select({
        user_id: user_wallets.user_id,
        chain_ns: user_wallets.chain_ns,
        address: user_wallets.address,
        is_primary: user_wallets.is_primary,
        verified_at: user_wallets.verified_at,
      })
      .from(user_wallets)

    const toDelete = planWalletDedupe(rows)
    if (toDelete.length === 0) {
      console.log(`✓ no case-duplicate wallets among ${rows.length} rows, nothing to do`)
      return
    }

    console.log(`Found ${toDelete.length} duplicate row(s) to remove (of ${rows.length} total):`)
    for (const r of toDelete) {
      console.log(`  - user ${r.user_id}  ${r.chain_ns}:${r.address}${r.is_primary ? ' (primary)' : ''}`)
    }

    if (!apply) {
      console.log('\nDRY RUN, re-run with `-- --apply` to delete these rows.')
      return
    }

    let deleted = 0
    for (const r of toDelete) {
      const res = await db
        .delete(user_wallets)
        .where(and(eq(user_wallets.chain_ns, r.chain_ns), eq(user_wallets.address, r.address)))
        .returning({ address: user_wallets.address })
      deleted += res.length
    }
    console.log(`\n✓ deleted ${deleted} duplicate wallet row(s)`)
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

void main()
