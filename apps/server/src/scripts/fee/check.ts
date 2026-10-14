/**
 * fee:check: is what the app DISPLAYS what the contracts CHARGE?
 *
 *   pnpm --filter tenda-server fee:check
 *
 * Reads every configured chain and compares to `platform_config`. READ-ONLY: it never
 * writes the DB and never sends a transaction. Run it after a contract redeploy (whose
 * init values are the likeliest source of drift) and whenever the boot log reports a
 * mismatch. Exit 0 = every chain agrees; 1 = at least one chain charges something else;
 * 2 = nothing disagrees but some chain could not be read.
 */
import 'dotenv/config'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@tenda/shared/db/schema'
import { loadConfig } from '@server/config'
import { configuredFees } from '@server/features/platform-fees/boot-check'
import { compareFees, describeComparison, feeCheckExitCode, readChainFees } from '@server/features/platform-fees/fees'
import { readOnlyAdapters } from './adapters'

async function main(): Promise<number> {
  const config = loadConfig()
  const client = postgres(config.DATABASE_URL, { max: 1 })
  try {
    const db = drizzle(client, { schema })
    const configured = await configuredFees(db)
    console.log(`platform_config: fee ${configured.fee_bps} bps, seeker fee ${configured.seeker_fee_bps} bps`)
    const comparison = compareFees(configured, await readChainFees(readOnlyAdapters()))
    for (const line of describeComparison(comparison)) console.log(line)
    return feeCheckExitCode(comparison)
  } finally {
    await client.end()
  }
}

main().then((code) => { process.exitCode = code }, (err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
