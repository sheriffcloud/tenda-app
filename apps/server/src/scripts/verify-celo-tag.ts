/**
 * Did that transaction actually carry our attribution tag?
 *
 *   pnpm --filter tenda-server verify:celo-tag <tx hash> [chain id]
 *
 * The check Celo's own instructions insist on, and the reason it is a script
 * rather than a test: the tag lives in signed calldata, so it cannot be added
 * after the fact and there is no backfill. Everything sent before the wiring is
 * right is permanently uncounted — which makes "decode transaction #1" the
 * cheapest check in the project and the most expensive one to skip.
 *
 * Defaults to Celo mainnet because that is the chain that scores; pass a
 * manifest chain id to check the testnet wiring first. RPC comes from .env when
 * configured and falls back to the manifest's public endpoint, so this runs
 * against a fresh checkout with no secrets at all.
 *
 * Exit status is the answer: 0 = every configured code is on-chain, 1 = not.
 */

import 'dotenv/config'
import { createPublicClient, http } from 'viem'
import { chainById, requireEvmPublicRpcUrl } from '@tenda/shared'
import { optionalEnv } from '@server/config/env'
import { chainEnvPrefix } from '@server/chains/secrets'
import {
  ATTRIBUTION_FAMILIES,
  attributionCodes,
  attributionEnvKey,
  checkTaggedTx,
  type TxHash,
} from '@server/features/attribution'

const DEFAULT_CHAIN_ID = 'eip155:42220'

/**
 * A type PREDICATE rather than a regex test plus a cast, so the narrowing is the
 * compiler's rather than an assertion I make to it — the same idiom
 * `isSupportedCurrency` uses on the other untrusted-string boundary.
 */
function isTxHash(value: string | undefined): value is TxHash {
  return value !== undefined && /^0x[0-9a-fA-F]{64}$/.test(value)
}

async function main(): Promise<number> {
  const [hash, chainArg] = process.argv.slice(2)
  if (!isTxHash(hash)) {
    console.error('usage: verify:celo-tag <0x… 32-byte tx hash> [chain id]')
    return 1
  }
  const chain_id = chainArg ?? DEFAULT_CHAIN_ID
  // Throws on an unknown id, which is the right failure: a typo'd chain would
  // otherwise report "untagged" and read as a wiring bug.
  const family = chainById(chain_id).family

  // "No scheme on this chain" and "no code configured" are different answers
  // with different fixes, and both would otherwise print as "(none
  // configured)" — then advise setting a variable that cannot help, because a
  // family with no scheme yields no codes whatever the env says. Refusing here
  // also spares an RPC round-trip on a question we already know the answer to.
  if (!ATTRIBUTION_FAMILIES.includes(family)) {
    console.error(
      `${chain_id} is in family '${family}', which runs no attribution scheme — ` +
        `nothing to check. Schemes exist for: ${ATTRIBUTION_FAMILIES.join(', ')}.`,
    )
    return 1
  }

  const expected = attributionCodes(chain_id)
  // `chainEnvPrefix` is the loader's OWN derivation, not a reimplementation of
  // it. The copy this replaced used `[^A-Z0-9]` where the loader uses
  // `[^A-Z0-9]+` — same answer for every id in the manifest today, and a
  // different one for any id with two adjacent separators.
  const rpc_url = optionalEnv(`${chainEnvPrefix(chain_id)}_RPC_URL`) ?? requireEvmPublicRpcUrl(chain_id)
  const client = createPublicClient({ transport: http(rpc_url) })

  console.log(`chain    ${chain_id}`)
  console.log(`rpc      ${rpc_url}`)
  console.log(`expected ${expected.length > 0 ? expected.join(', ') : '(none configured)'}`)

  const result = await checkTaggedTx({ chain_id, client, hash })
  if (result.status === 'untagged') {
    // One message for two causes — an unattached call site and an unreachable
    // RPC — because `verifyTx` never throws and cannot tell them apart. Naming
    // both is more useful than picking one.
    console.error('\nUNTAGGED: no ERC-8021 suffix decoded from this transaction.')
    console.error('Either it was built before the tag was wired, or the RPC did not return it.')
    return 1
  }

  console.log(`\nfound    ${result.codes.join(', ')} (schema ${result.schemaId})`)
  if (result.missing.length > 0) {
    console.error(`MISSING: ${result.missing.join(', ')} — this transaction will not be credited.`)
    return 1
  }
  if (expected.length === 0) {
    // Tagged by something, but this process has no code configured to compare
    // against — so it cannot say the tag is OURS. Not a pass.
    console.error(`NO EXPECTATION: set ${attributionEnvKey(family)} to check this is our tag.`)
    return 1
  }
  console.log('OK: every configured attribution code is present on-chain.')
  return 0
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  },
)
