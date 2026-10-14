/**
 * Mint the ERC-8004 Agent ID — the token whose `agentURI` is our agent card.
 *
 *   export PRIVATE_KEY=0x…                       # the agent wallet, in YOUR SHELL
 *   pnpm --filter tenda-server mint:agent-id -- --uri https://api.tendahq.com/.well-known/agents/0x….json
 *   …the same, plus --confirm                    # broadcasts, spends CELO
 *   …plus --chain eip155:11142220                # Celo Sepolia instead of mainnet
 *
 * DRY RUN IS THE DEFAULT and `--confirm` is the only way past it. This spends
 * real money on a real chain and mints a token that cannot be un-minted, so the
 * safe thing has to be the thing that happens when you type the command wrong.
 * The dry run does every check and a full `simulateContract`, so it fails for
 * the same reasons the real thing would — the only difference is the broadcast.
 *
 * WHY THIS EXISTS RATHER THAN THE DOCUMENTED SNIPPET. Celo's page shows
 * `@chaoschain/sdk` with `tx.events.Transfer.returnValues.tokenId`, which is
 * web3.js, does not construct a signer, and assumes the agentURI is on IPFS.
 * Ours is an HTTPS URL — explicitly allowed by EIP-8004 and deliberately
 * chosen (#84) so the document can change without a transaction. The contract's
 * real interface was probed on-chain; see `registry.ts`.
 *
 * NOTHING IS AMBIENT, and that is the whole design. This script does not load
 * `.env`, does not read the server config, and has no default `--uri`. Both
 * irreversible inputs must be supplied explicitly, for this one invocation:
 *
 *   `PRIVATE_KEY`  exported in the SHELL, never printed, never from a dotfile.
 *   `--uri`        typed out in full, never derived.
 *
 * It costs one extra flag and it removes a whole class of mistake. A URI
 * derived from `API_BASE_URL` writes whatever happens to be in the environment
 * — localhost on a laptop, a stale host on a box pointed somewhere else last
 * month — permanently into a public registry. A key read from `.env` signs with
 * whatever wallet was left lying there. Neither is a value anyone wants
 * inherited; both are values worth looking at while typing.
 *
 * The wallet must be the one the card describes AND the one that funds AskBots
 * (#87) — one wallet, or the mint has to be redone. The dry run checks that
 * before anything is signed.
 *
 * Exit status is the answer: 0 = minted (or dry run passed), 1 = did not.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createPublicClient, createWalletClient, http, formatEther, parseEventLogs } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  chainById,
  requireEvmPublicRpcUrl,
  evmChainNumericId,
  nativeCurrencyOf,
} from '@tenda/shared'
import { IDENTITY_REGISTRY, IDENTITY_REGISTRY_ABI, REGISTRY_NAME, scanUrl } from './registry'
import { checkAgentUri, defaultAgentUri, reportChecks, type Check } from './preflight'

const DEFAULT_CHAIN_ID = 'eip155:42220'
const RECEIPT_DIR = 'receipts/agent-id'

/**
 * Only ever used to SUGGEST a `--uri` in the error above — never to act. A
 * literal rather than a config read, so the suggestion cannot inherit a wrong
 * host from the environment the way the old default did.
 */
const PUBLIC_API_HOST = 'https://api.tendahq.com'

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i === -1 ? undefined : process.argv[i + 1]
}

/**
 * A 0x-prefixed 32-byte private key from the SHELL, or a refusal that does not
 * echo it. `.env` is deliberately never loaded, so only `export PRIVATE_KEY=0x…`
 * in this terminal can sign — a key left in a dotfile cannot.
 */
function requirePrivateKey(): `0x${string}` {
  const key = process.env.PRIVATE_KEY
  if (key === undefined || key === '') {
    throw new Error('PRIVATE_KEY is not set — run `export PRIVATE_KEY=0x…` in this shell first')
  }
  // Shape only, and the value is never logged: a malformed key must fail here
  // with a description rather than inside viem with the key in the message.
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('PRIVATE_KEY is not a 0x-prefixed 32-byte hex key (value withheld)')
  }
  return key as `0x${string}`
}

async function main(): Promise<number> {
  const chain_id = arg('--chain') ?? DEFAULT_CHAIN_ID
  const confirm = process.argv.includes('--confirm')

  const entry = chainById(chain_id)
  if (entry === undefined) return fail(`unknown chain '${chain_id}'`)
  const registry = IDENTITY_REGISTRY[chain_id]
  if (registry === undefined) {
    return fail(`no ERC-8004 registry recorded for '${chain_id}' (see registry.ts)`)
  }

  const account = privateKeyToAccount(requirePrivateKey())
  const rpcUrl = requireEvmPublicRpcUrl(chain_id)
  // `nativeCurrencyOf`, not a retyped { name: 'CELO', … }: the manifest already
  // owns this and a second copy is how a non-Celo registry entry would one day
  // print the wrong symbol at the moment someone is deciding whether to spend.
  const currency = nativeCurrencyOf(entry)
  const chain = {
    id: evmChainNumericId(chain_id),
    name: entry.displayName,
    nativeCurrency: currency,
    rpcUrls: { default: { http: [rpcUrl] } },
  } as const
  const publicClient = createPublicClient({ transport: http(rpcUrl) })
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) })

  // REQUIRED, never derived: this string is written on-chain.
  const agentURI = arg('--uri')
  if (agentURI === undefined) {
    console.error('\n--uri is required — it is written on-chain, so it is never taken from the environment.')
    console.error('For this wallet it is almost certainly:\n')
    console.error(`  --uri ${defaultAgentUri(PUBLIC_API_HOST, account.address)}\n`)
    console.error(`Check the host is right before pasting it (suggested from ${PUBLIC_API_HOST}).\n`)
    return 1
  }

  console.log(`\nERC-8004 Agent ID mint${confirm ? '' : '  (DRY RUN — nothing will be signed)'}`)
  console.log(`  chain     ${chain_id}  (${entry.displayName})`)
  console.log(`  registry  ${registry}`)
  console.log(`  wallet    ${account.address}`)
  console.log(`  agentURI  ${agentURI}\n`)

  const checks: Check[] = []

  // Is the thing at that address actually the registry? This is what makes the
  // unverified Sepolia entry in registry.ts safe to keep.
  try {
    const name = await publicClient.readContract({ address: registry, abi: IDENTITY_REGISTRY_ABI, functionName: 'name' })
    checks.push({ name: 'registry answers name()', ok: name === REGISTRY_NAME, detail: `"${name}"` })
  } catch (error) {
    checks.push({ name: 'registry answers name()', ok: false, detail: describe(error) })
  }

  checks.push(...(await checkAgentUri(agentURI, account.address)))

  // ALREADY MINTED? One wallet is one identity. A second mint costs money and
  // produces a second token pointing at the same card, which is worse than
  // useless — two ids for one agent is exactly the ambiguity the registry
  // exists to remove. Refused unless --allow-second is passed deliberately.
  const owned = await publicClient.readContract({
    address: registry,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  })
  const allowSecond = process.argv.includes('--allow-second')
  checks.push({
    name: 'wallet holds no Agent ID yet',
    ok: owned === 0n || allowSecond,
    detail:
      owned === 0n
        ? 'none'
        : `already holds ${owned}${allowSecond ? ' (--allow-second given)' : ' — pass --allow-second to mint anyway'}`,
  })

  // AFFORDABILITY, not `balance > 0`. One wei passes a non-zero test and then
  // fails at broadcast, after the pre-flight said everything was fine. Estimate
  // the real cost and compare, with headroom for the price moving in between.
  const balance = await publicClient.getBalance({ address: account.address })
  let cost: bigint | undefined
  try {
    const gas = await publicClient.estimateContractGas({
      address: registry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'register',
      args: [agentURI],
      account,
    })
    const gasPrice = await publicClient.getGasPrice()
    cost = (gas * gasPrice * 12n) / 10n
    checks.push({
      name: 'wallet can afford the mint',
      ok: balance >= cost,
      detail: `${formatEther(balance)} ${currency.symbol} held, ~${formatEther(cost)} needed (${gas} gas @ ${gasPrice / 10n ** 9n} gwei, +20%)`,
    })
  } catch (error) {
    checks.push({ name: 'wallet can afford the mint', ok: false, detail: describe(error) })
  }

  // The real proof it will work: simulate the exact call. Returns the token id
  // the mint WOULD produce, and reverts here rather than after paying.
  let predicted: bigint | undefined
  try {
    const { result } = await publicClient.simulateContract({
      address: registry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'register',
      args: [agentURI],
      account,
    })
    predicted = result
    checks.push({ name: 'register() simulates', ok: true, detail: `would mint Agent ID ${result}` })
  } catch (error) {
    checks.push({ name: 'register() simulates', ok: false, detail: describe(error) })
  }

  console.log('Pre-flight:')
  if (!reportChecks(checks)) {
    console.error('\nRefusing to mint — fix the FAIL lines above.')
    return 1
  }

  if (!confirm) {
    console.log('\nDry run passed. Nothing was signed and no CELO was spent.')
    console.log('Re-run with --confirm to broadcast:')
    // The WHOLE command, `--uri` included: it is required now, so a line that
    // omits it is a copy-paste that fails.
    console.log(`  pnpm --filter tenda-server mint:agent-id -- \\`)
    console.log(`    --chain ${chain_id} --uri ${agentURI} --confirm\n`)
    return 0
  }

  console.log('\nBroadcasting…')
  const hash = await wallet.writeContract({
    address: registry,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'register',
    args: [agentURI],
    chain,
  })
  console.log(`  tx ${hash}`)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') return fail(`transaction reverted on-chain: ${hash}`)

  // The token id comes from the Transfer event, NOT from the simulation above:
  // a simulation reads a pre-transaction state, so another mint landing first
  // would shift the id. The event is what the chain actually recorded.
  const [minted] = parseEventLogs({ abi: IDENTITY_REGISTRY_ABI, eventName: 'Transfer', logs: receipt.logs })
  if (minted === undefined) return fail(`no Transfer event in ${hash} — cannot read the Agent ID`)
  const agentId = minted.args.tokenId
  if (predicted !== undefined && predicted !== agentId) {
    console.log(`  note: simulation predicted ${predicted}, chain assigned ${agentId} (another mint landed first)`)
  }

  const record = {
    agentId: agentId.toString(),
    chain_id,
    registry,
    wallet: account.address,
    agentURI,
    txHash: hash,
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString(),
    mintedAt: new Date().toISOString(),
  }
  mkdirSync(RECEIPT_DIR, { recursive: true })
  const file = join(RECEIPT_DIR, `${chain_id.replace(/[^a-z0-9]+/gi, '-')}-${agentId}.json`)
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)

  console.log(`\n  AGENT ID   ${agentId}`)
  console.log(`  gas used   ${receipt.gasUsed}`)
  console.log(`  receipt    ${file}`)
  console.log(`  scan       ${scanUrl(chain_id, agentId)}\n`)
  console.log('Next, in order — the tag has NO BACKFILL, so it must precede the first Celo tx:')
  console.log('  1. npx skills add https://celobuilders.xyz   (register; needs this Agent ID)')
  console.log('  2. set CELO_ATTRIBUTION_CODE from the celo_… tag it returns, and redeploy')
  console.log('  3. deploy TendaEscrow to Celo mainnet (#86) with TENDA_APPROVAL_WINDOW_S=86400')
  console.log('  4. pnpm --filter tenda-server verify:celo-tag <first tx hash>\n')
  console.log('Then `unset PRIVATE_KEY` — it has done its one job.\n')
  return 0
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message.split('\n')[0] : String(error)
}

function fail(message: string): number {
  console.error(`\n${message}\n`)
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(`\n${describe(error)}\n`)
    process.exit(1)
  })
