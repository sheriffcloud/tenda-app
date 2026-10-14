/**
 * fee:set: change the platform fee, safely, in the one order that cannot show a user a
 * fee no contract charges.
 *
 *   pnpm --filter tenda-server fee:set <fee_bps> <seeker_fee_bps>
 *
 * The contracts' admin is a multisig, so this does not move a fee itself. It reads every
 * configured chain and, for each one that still needs the change, PRINTS the call the
 * multisig must execute. Re-run it after they are executed: when EVERY chain is read and
 * charges the target it writes `platform_config`, and not before. A chain that cannot be
 * read blocks the write (it cannot be confirmed). Running servers pick the new number up
 * within the 5-minute platform-config cache.
 *
 * Exit 0 = written; 2 = nothing written (chains still to change, or unreadable).
 */
import 'dotenv/config'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@tenda/shared/db/schema'
import { chainById } from '@tenda/shared'
import { loadConfig } from '@server/config'
import { feeSetArgsProblem, runFeeSet, setFeeBpsCalldata } from '@server/features/platform-fees/fee-set'
import { readOnlyAdapters } from './adapters'

async function main(): Promise<number> {
  const parsed = feeSetArgsProblem(process.argv.slice(2))
  if ('problem' in parsed) {
    console.error(parsed.problem)
    return 1
  }
  const { target } = parsed
  const adapters = readOnlyAdapters()
  const config = loadConfig()
  const client = postgres(config.DATABASE_URL, { max: 1 })
  try {
    const { plan, wrote } = await runFeeSet({ db: drizzle(client, { schema }), adapters, target })
    console.log(`target: fee ${target.fee_bps} bps, seeker fee ${target.seeker_fee_bps} bps`)
    for (const chain of plan.chains) {
      if (chain.state === 'at_target') console.log(`ok       ${chain.chain_id}: already charges the target`)
      else if (chain.state === 'unreadable') console.log(`UNKNOWN  ${chain.chain_id}: could not be read (${chain.error}); cannot confirm`)
      else {
        const adapter = adapters.find((a) => a.chain_id === chain.chain_id)
        console.log(`PENDING  ${chain.chain_id}: charges ${chain.current.fee_bps}/${chain.current.seeker_fee_bps} bps`)
        if (chainById(chain.chain_id).namespace === 'eip155') {
          console.log(`           multisig: call ${adapter?.escrowAddress ?? '<escrow contract>'} with data ${setFeeBpsCalldata(target)}`)
        } else {
          console.log(`           multisig: execute setFeeBps(${target.fee_bps}, ${target.seeker_fee_bps}) on the program (platform_state admin)`)
        }
      }
    }
    if (wrote) console.log('platform_config written: every chain confirmed.')
    else console.log('platform_config NOT written. Execute the pending calls, then run this again.')
    return wrote ? 0 : 2
  } finally {
    await client.end()
  }
}

main().then((code) => { process.exitCode = code }, (err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
