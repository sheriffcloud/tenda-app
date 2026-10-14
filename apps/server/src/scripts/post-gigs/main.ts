/**
 * Seed a gig book against a running API, as an AGENT.
 *
 *   pnpm --filter tenda-server post-gigs -- --write-book book.json
 *   AGENT_KEY=0x… pnpm --filter tenda-server post-gigs -- --api https://dev-api.tendahq.com \
 *     --chain eip155:16602 [--book book.json] [--skip 1] [--limit 3] [--amount 1000000] [--dry-run]
 *
 * THE BOOK IS A FILE OR THE BUILT-IN ONE. `--write-book` dumps the built-in
 * book as JSON; a reviewer edits and signs it off; `--book` posts that file.
 * Either way the book is run through the server's own validators BEFORE the
 * agent registers (`book.ts`), so a bad entry fails here, by index and in the
 * server's words, never as a 422 one gig into a funded run.
 *
 * `--skip` RESUMES a partial run. Every post is funded and irreversible, so a
 * run that posted 7 of 20 must be continued, not restarted: each invocation
 * mints fresh `creation_operation_id`s, so re-running the whole book would
 * duplicate the 7 already on chain rather than deduplicate against them.
 *
 * Needs AGENT_KEY exported in the shell — NOT in .env; this script loads no
 * dotenv, so a key in the env file is ignored on purpose. The agent's wallet
 * funds every escrow; the server's RELAYER pays the gas, so the agent needs
 * the token and no native balance. A dry run needs no key.
 *
 * WHY THIS IS NOT `verify:agent-hire`. That script proves the whole hire loop
 * and settles it, which means it onboards a WORKER — and worker onboarding
 * falls back to a phone OTP read out of the server's log file. That works
 * against a local server and cannot work against a deployed one. Posting is
 * purely the agent side, and agents are wallet-born: `POST /v1/agent/register`
 * takes a wallet signature and no OTP. So this reuses that script's HTTP
 * helpers and does only the half that a deployed environment allows.
 *
 * THE CHAIN AND ASSET ARE FLAGS, not constants: the asset is resolved from
 * the shared manifest by chain id, so a chain with no gig asset fails HERE
 * with a clear message rather than as a 422 mid-run. The fee and the asset's
 * decimals are read the same way — from the API and the asset registry —
 * because a projection printed with a typed 250 bps or a typed six decimals is
 * a number the deployment can contradict.
 */

import { privateKeyToAccount } from 'viem/accounts'
import {
  apiRoutes,
  chainById,
  getAssetMeta,
  gigAssetByChain,
  TENDA_RELAY_SCHEME,
  X402_VERSION,
  type AgentTaskBody,
  type AgentTaskCreated,
  type AgentTaskPaymentRequired,
  type PlatformConfig,
} from '@tenda/shared'
import { expectStatus, makeApi, newOperationId, registerAgent, type Api } from '../agent-hire-e2e/actors'
import { parseArgs, readAgentKey, type PostArgs } from './args'
import { readBookFile, validateBook, writeBook } from './book'
import { GIG_BOOK, type GigSeed } from './gigs'
import { withRateLimitRetry, type RetryOptions } from './rate-limit'
import { selectGigs } from './select'
import { appendReceipt, defaultReceiptPath } from './receipts'
import { evmTermsFrom } from './terms'

/**
 * How many times one leg may be re-sent through the limiter. Five covers a
 * handful of consecutive windows, which is what a twenty-gig book needs against
 * a route that admits five gigs a minute; beyond that the run is not being
 * throttled, something is wrong and the operator should see the server's words.
 */
const RETRY_ATTEMPTS = 5

/** Base units as a human amount, at the ASSET's decimals: '2000000' at 6 → '2.000000'. */
export function formatAmount(raw: string, decimals: number): string {
  const unit = 10n ** BigInt(decimals)
  const value = BigInt(raw)
  const fraction = (value % unit).toString().padStart(decimals, '0')
  return decimals === 0 ? `${value / unit}` : `${value / unit}.${fraction}`
}

/** What the CONTRACT will pay out, by its own arithmetic: floor division. */
export function projectPayout(amountRaw: string, feeBps: number): { fee: bigint; payout: bigint } {
  const amount = BigInt(amountRaw)
  const fee = (amount * BigInt(feeBps)) / 10_000n
  return { fee, payout: amount - fee }
}

interface Posted {
  title: string
  taskId: string
  txRef: string
  amountRaw: string
}

/**
 * One listing: quote (402) → sign the authorization → resend with X-PAYMENT.
 *
 * The body is sent TWICE, byte-identical. That is the contract of the one-shot
 * endpoint: the first call mints (or finds) the draft and quotes terms bound to
 * it, the second presents payment for those terms. A body that differed between
 * the two would be quoting one draft and paying for another.
 *
 * BOTH legs wait out a 429. The route admits ten requests a minute and each gig
 * spends two of them, so any book longer than five gigs WILL be rate-limited
 * mid-run — see `rate-limit.ts`. Retrying the quote is free; retrying the paid
 * leg is safe because a 429 is refused by the limiter before the handler runs,
 * so nothing was charged and nothing was broadcast.
 */
async function postOne(
  api: Api,
  token: string,
  account: ReturnType<typeof privateKeyToAccount>,
  body: AgentTaskBody,
  retry: RetryOptions,
): Promise<Posted> {
  const quote = await withRateLimitRetry(
    () => api(apiRoutes.agent.tasks, { method: 'POST', token, body }),
    retry,
  )
  if (quote.status !== 402) {
    throw new Error(`expected 402 with terms, got ${quote.status} — ${JSON.stringify(quote.json)}`)
  }
  const quoted = quote.json as unknown as AgentTaskPaymentRequired
  const payment = evmTermsFrom(quoted, body.chain_id)
  // Three casts survive in this function and they are two different kinds.
  // `quote.json` and `created.json` above and below narrow what the shared
  // helper hands back — it types every body as `Record<string, unknown>`
  // (agent-hire-e2e/actors.ts) — to the DOCUMENT's own types, which is the
  // improvement: they used to narrow to shapes hand-written here. This one is
  // a LIBRARY boundary instead: viem's signTypedData takes a generic over its
  // own type map, which `ReceiveAuthorizationTypedData` satisfies structurally
  // but cannot be assigned to. The MESSAGE below needs no cast at all any
  // more — it is read straight off the typed wire value.
  const typed = payment.typed_data as unknown as Parameters<typeof account.signTypedData>[0]
  const signature = await account.signTypedData(typed)

  const header = Buffer.from(
    JSON.stringify({
      x402Version: X402_VERSION,
      scheme: TENDA_RELAY_SCHEME,
      network: body.chain_id,
      payload: { signature, authorization: payment.typed_data.message },
    }),
  ).toString('base64')

  const created = await withRateLimitRetry(
    () => api(apiRoutes.agent.tasks, { method: 'POST', token, body, headers: { 'x-payment': header } }),
    retry,
  )
  if (created.status !== 201) {
    throw new Error(`expected 201, got ${created.status} — ${JSON.stringify(created.json)}`)
  }
  return {
    title: body.title,
    taskId: quoted.task_id,
    txRef: (created.json as unknown as AgentTaskCreated).tx_ref,
    amountRaw: body.amount_raw,
  }
}

/** A validated seed plus the run's half: a fresh operation id, the chain, its asset. */
export function bodyFor(seed: GigSeed, chain_id: string, asset: string): AgentTaskBody {
  return { ...seed, creation_operation_id: newOperationId(), chain_id, asset }
}

async function post(args: PostArgs): Promise<void> {
  const entry = chainById(args.chain)
  const asset = gigAssetByChain(args.chain)
  if (asset === null) throw new Error(`${args.chain} declares no gig asset in the manifest`)
  const meta = getAssetMeta(asset)
  if (meta === null) throw new Error(`${asset} has no entry in the shared asset registry`)
  const amount = (raw: string): string => formatAmount(raw, meta.decimals)

  // The whole book is checked BEFORE anything else happens, the built-in one
  // included: a typed entry can still break a runtime rule (a city outside its
  // country), and a file has had no compiler at all.
  const source = args.book === null ? GIG_BOOK : readBookFile(args.book)
  const validated = validateBook(source, { chain_id: args.chain, asset, amount: args.amount })
  const book = selectGigs(validated, { skip: args.skip, limit: args.limit ?? validated.length, only: args.only })

  console.log(`API    : ${args.api}`)
  console.log(`Chain  : ${entry.displayName} (${args.chain})  asset ${asset}`)
  console.log(`Book   : ${args.book ?? 'built-in'} (${validated.length} gigs, all valid)`)
  console.log(
    `Gigs   : ${book.length}${args.skip > 0 ? ` (skipping the first ${args.skip})` : ''}` +
      `${args.amount !== null ? ` · all at ${amount(args.amount)}` : ''}`,
  )
  // The projection, printed BEFORE anything is posted: on a real chain this is
  // the last cheap moment to notice that the book costs more than intended.
  const total = book.reduce((sum, g) => sum + BigInt(g.amount_raw), 0n)
  console.log(`Funding: ${amount(total.toString())} ${meta.symbol} from the agent wallet\n`)

  const api = makeApi(args.api)

  if (args.dryRun) {
    const cfg = await api(apiRoutes.platform.config)
    expectStatus('GET /v1/platform/config', cfg, 200)
    const { fee_bps } = cfg.json as unknown as PlatformConfig
    for (const [i, seed] of book.entries()) {
      const { fee, payout } = projectPayout(seed.amount_raw, fee_bps)
      console.log(
        `${String(i + 1).padStart(2)}. ${amount(seed.amount_raw)} → worker ${amount(payout.toString())} (fee ${amount(fee.toString())} at ${fee_bps} bps)  ${seed.title}`,
      )
    }
    console.log('\n--dry-run: nothing was posted.')
    return
  }

  const account = privateKeyToAccount(readAgentKey(process.env))
  console.log(`Agent  : ${account.address}`)

  // Enough attempts to outlast a few windows: the route admits five gigs a
  // minute, so a full book spends most of its wall-clock waiting by design.
  const retry: RetryOptions = {
    attempts: RETRY_ATTEMPTS,
    onWait: (waitMs, attempt) =>
      console.log(`      rate limited — waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt})`),
  }

  // Keyed by host so a mainnet run can never append into a preview file.
  const receiptPath = args.out ?? defaultReceiptPath(args.api)
  console.log(`Receipts: ${receiptPath} (written as each gig lands)\n`)

  const reg = await registerAgent(api, account, args.chain, args.name, args.api)
  console.log(`registered agent → ${reg.token.slice(0, 12)}…\n`)

  const posted: Posted[] = []
  const failed: { title: string; why: string }[] = []
  for (const [i, seed] of book.entries()) {
    const label = `${String(i + 1).padStart(2)}/${book.length}`
    try {
      const body = bodyFor(seed, args.chain, asset)
      const p = await postOne(api, reg.token, account, body, retry)
      // BEFORE the next gig: this escrow is funded and irreversible, and its id
      // is the only handle for cancelling it later. A run cut short by the rate
      // limiter must still leave an exact record of what it committed.
      appendReceipt(receiptPath, {
        at: new Date().toISOString(),
        api: args.api,
        chain_id: args.chain,
        task_id: p.taskId,
        tx_ref: p.txRef,
        title: p.title,
        amount_raw: p.amountRaw,
        requires_approval: body.requires_approval === true,
      })
      posted.push(p)
      console.log(`${label} ✓ ${amount(p.amountRaw)} ${p.taskId}  ${p.title}`)
    } catch (err) {
      // One bad listing must not abandon the rest — and on a funded chain the
      // ones already posted are real, so the run has to report them either way.
      const why = err instanceof Error ? err.message : String(err)
      failed.push({ title: seed.title, why })
      console.log(`${label} ✗ ${seed.title}\n      ${why}`)
    }
  }

  console.log(`\nposted ${posted.length}/${book.length}`)
  for (const p of posted) console.log(`  ${p.taskId}  tx ${p.txRef}`)
  if (failed.length > 0) {
    console.log(`\nfailed ${failed.length}:`)
    for (const f of failed) console.log(`  ${f.title}\n    ${f.why}`)
    process.exitCode = 1
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.mode === 'write-book') {
    writeBook(args.file, GIG_BOOK)
    console.log(`wrote ${GIG_BOOK.length} gigs to ${args.file} — edit, sign off, then post with --book ${args.file}`)
    return
  }
  await post(args)
}

// Only when run directly, so importing this module cannot post a gig book.
if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  })
}
