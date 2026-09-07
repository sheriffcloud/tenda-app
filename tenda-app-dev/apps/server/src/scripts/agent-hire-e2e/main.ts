/**
 * #20 — the first agent→human hire, settled end to end on 0G Galileo.
 *
 *   pnpm --filter tenda-server verify:agent-hire [amount_raw=25000000]
 *
 * Needs a RUNNING server (the agent half is HTTP-only by design), E2E_AGENT_KEY
 * and E2E_WORKER_KEY in .env, and the log the server is writing so the dev OTP
 * can be read back.
 *
 * The loop, and who pays for each step:
 *   create   relayed  — the agent signs an EIP-3009 authorization, RELAYER pays gas
 *   accept   worker   — worker pays
 *   submit   worker   — worker pays
 *   approve  AGENT    — the agent pays, because `approveCompletion` requires
 *                       msg.sender == creator and the contract has no relayed
 *                       variant. That is the "Not in v1" line, measured here.
 * `approveCompletion` settles in the same transaction, so there is no separate
 * claim on the happy path.
 */
import 'dotenv/config'
import { type AgentTaskBody, apiRoutes, MIN_ACCEPT_WINDOW_SECONDS } from '@tenda/shared'
import { actorAccount, chainCtx, mint, native, sendUnsigned, usdc } from './chain'
import {
  buildTransition,
  expectStatus,
  makeApi,
  newOperationId,
  onboardWorker,
  ping,
  registerAgent,
  type Api,
} from './actors'

const CHAIN_ID = 'eip155:16602'
const TOKEN = '0x3780460189622E60cB7ec6e8e97038A386674B71'
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000'
const LOG_PATH = process.env.E2E_SERVER_LOG ?? '/home/abioye/.claude/jobs/348934df/tmp/e20-server.log'
const AMOUNT = BigInt(process.argv[2] ?? '25000000')

const req = (name: string): string => {
  const v = process.env[name]
  if (v === undefined || v === '') throw new Error(`${name} is not set`)
  return v
}
const usd = (raw: bigint): string => `${(Number(raw) / 1e6).toFixed(2)} USDC`
const gas = (wei: bigint): string => `${(Number(wei) / 1e18).toFixed(6)} 0G`
let step = 0
const phase = (msg: string): void => { step += 1; console.log(`\n[${step}] ${msg}`) }

async function pollGig(api: Api, token: string, id: string, want: string, tries = 40): Promise<Record<string, unknown>> {
  for (let i = 0; i < tries; i += 1) {
    const res = await api(apiRoutes.gigs.get.replace(':id', id), { token })
    const gig = res.json as Record<string, unknown>
    if (gig.status === want) return gig
    await new Promise((r) => setTimeout(r, 3000))
  }
  throw new Error(`escrow ${id} never reached '${want}'`)
}

async function main(): Promise<void> {
  const api = makeApi(BASE_URL)
  const ctx = chainCtx(req('CHAIN_EIP155_16602_RPC_URL'), TOKEN)
  const agent = actorAccount(req('E2E_AGENT_KEY'))
  const worker = actorAccount(req('E2E_WORKER_KEY'))
  const relayer = actorAccount(req('CHAIN_EIP155_16602_RELAYER_KEY'))
  const treasury = req('CHAIN_EIP155_16602_TREASURY_ADDR')

  console.log('agent   ', agent.address, '(HTTP + a key. No RPC.)')
  console.log('worker  ', worker.address)
  console.log('relayer ', relayer.address)
  console.log('treasury', treasury)

  phase('Pre-flight')
  const cfg = await api(apiRoutes.platform.config)
  expectStatus('GET /v1/platform/config', cfg, 200)
  const feeBps = BigInt((cfg.json as { fee_bps: number }).fee_bps)
  const expectedFee = (AMOUNT * feeBps) / 10_000n
  const expectedPayout = AMOUNT - expectedFee
  console.log(`   amount ${usd(AMOUNT)} · fee ${feeBps} bps → fee ${usd(expectedFee)}, worker ${usd(expectedPayout)}`)
  const wallets = { agent, worker, relayer, treasury }
  const before = await balances(ctx, wallets)
  const agentUsdcBefore = await usdc(ctx, agent.address)

  phase(`Mint ${usd(AMOUNT)} to the agent (relayer pays; the mock mint is unpermissioned)`)
  if (agentUsdcBefore < AMOUNT) {
    console.log('   tx', await mint(ctx, relayer, agent.address, AMOUNT))
  } else {
    console.log('   already funded, skipping')
  }

  phase('Agent registers by wallet proof — POST /v1/agent/register')
  const reg = await registerAgent(api, agent, CHAIN_ID, 'Dispatch Bot')
  console.log(`   is_new=${reg.is_new} is_agent=${reg.user.is_agent} id=${reg.user.id}`)

  const approveOnly = process.env.E2E_APPROVE_TASK
  if (approveOnly !== undefined && approveOnly !== '') {
    phase(`Approve-only: settling ${approveOnly}, submitted by a human in the app`)
    const submitted = await pollGig(api, reg.token, approveOnly, 'submitted', 1)
    console.log(`   creator.is_agent = ${(submitted.creator as { is_agent: boolean }).is_agent}`)
    const tx = await sendUnsigned(ctx, agent, await buildTransition(api, reg.token, apiRoutes.escrows.approve.replace(':id', approveOnly)))
    await ping(api, reg.token, { tx_ref: tx, action: 'approve', chain_id: CHAIN_ID, escrow_id: approveOnly })
    await pollGig(api, reg.token, approveOnly, 'completed')
    console.log(`   completed · ${tx}`)
    await settlement(ctx, wallets, before, AMOUNT, expectedPayout, expectedFee)
    return
  }

  phase('Worker signs in (OTP), names themselves, links their wallet')
  const w = await onboardWorker(api, worker, CHAIN_ID, LOG_PATH)
  console.log(`   worker ${w.how} → ${w.id}`)

  phase('Agent posts the task — POST /v1/agent/tasks (no X-PAYMENT) → 402')
  // TYPED, so the compiler catches the next wire change instead of a 422 at
  // run time: this literal still carried `accept_deadline_unix` after #41
  // replaced it, and nothing noticed until an audit read it.
  const body: AgentTaskBody = {
    creation_operation_id: newOperationId(),
    chain_id: CHAIN_ID,
    asset: 'USDC_0G',
    amount_raw: AMOUNT.toString(),
    // The shortest window the API allows — this listing exists for one run.
    accept_window_seconds: MIN_ACCEPT_WINDOW_SECONDS,
    completion_duration_seconds: 3600,
    title: 'Summarise three PDFs into one brief',
    category: 'digital',
    remote: true,
  }
  const quote = await api(apiRoutes.agent.tasks, { method: 'POST', token: reg.token, body })
  expectStatus('POST /v1/agent/tasks', quote, 402)
  const terms = (quote.json as { accepts: [{ payment: { typed_data: Record<string, never> } }]; task_id: string })
  const taskId = terms.task_id
  console.log(`   402 · task_id ${taskId}`)

  phase('Agent signs the EIP-3009 authorization and resends with X-PAYMENT → 201')
  const td = terms.accepts[0].payment.typed_data as unknown as Parameters<typeof agent.signTypedData>[0]
  const signature = await agent.signTypedData(td)
  const header = Buffer.from(JSON.stringify({
    x402Version: 1,
    scheme: 'tenda-escrow-create',
    network: CHAIN_ID,
    payload: { signature, authorization: (td as unknown as { message: unknown }).message },
  })).toString('base64')
  const created = await api(apiRoutes.agent.tasks, {
    method: 'POST', token: reg.token, body, headers: { 'x-payment': header },
  })
  expectStatus('POST /v1/agent/tasks (X-PAYMENT)', created, 201)
  console.log(`   201 · tx_ref ${(created.json as { tx_ref: string }).tx_ref}`)

  phase('Waiting for the relayed create to confirm → open')
  const open = await pollGig(api, reg.token, taskId, 'open')
  console.log(`   open · creator.is_agent = ${(open.creator as { is_agent: boolean }).is_agent}`)

  if (process.env.E2E_STOP_AFTER_OPEN === '1') {
    console.log(`\n🧑 Left OPEN for a human worker to take in the app.`)
    console.log(`   gig      ${BASE_URL.replace('3000', '3200')}/gig/${taskId}`)
    console.log(`   worker   ${worker.address} (import E2E_WORKER_KEY into the browser wallet)`)
    console.log(`   posted by an AGENT — the card and the detail page should both badge it.`)
    return
  }

  phase('Worker accepts')
  const acceptTx = await sendUnsigned(ctx, worker, await buildTransition(api, w.token, apiRoutes.escrows.accept.replace(':id', taskId)))
  await ping(api, w.token, { tx_ref: acceptTx, action: 'accept', chain_id: CHAIN_ID, escrow_id: taskId })
  await pollGig(api, w.token, taskId, 'accepted')
  console.log(`   accepted · ${acceptTx}`)

  phase('Worker submits proof')
  const proofHash = `0x${'ab'.repeat(32)}`
  const submitTx = await sendUnsigned(ctx, worker, await buildTransition(api, w.token, apiRoutes.escrows.submit.replace(':id', taskId), { proof_hash: proofHash }))
  await ping(api, w.token, { tx_ref: submitTx, action: 'submit', chain_id: CHAIN_ID, escrow_id: taskId })
  await pollGig(api, w.token, taskId, 'submitted')
  console.log(`   submitted · ${submitTx}`)

  phase('AGENT approves — it signs and pays gas itself (no relayed approve in v1)')
  const approveTx = await sendUnsigned(ctx, agent, await buildTransition(api, reg.token, apiRoutes.escrows.approve.replace(':id', taskId)))
  await ping(api, reg.token, { tx_ref: approveTx, action: 'approve', chain_id: CHAIN_ID, escrow_id: taskId })
  await pollGig(api, reg.token, taskId, 'completed')
  console.log(`   completed · ${approveTx}`)

  phase('Settlement')
  await settlement(ctx, wallets, before, AMOUNT, expectedPayout, expectedFee)
  console.log('\n✅ agent → human hire settled on Galileo, fee split exact, badge on the wire.')
}

interface Wallets { agent: { address: string }; worker: { address: string }; relayer: { address: string }; treasury: string }
type Snapshot = Awaited<ReturnType<typeof balances>>

async function balances(ctx: ReturnType<typeof chainCtx>, w: Wallets) {
  return {
    workerUsdc: await usdc(ctx, w.worker.address),
    treasuryUsdc: await usdc(ctx, w.treasury),
    agentGas: await native(ctx, w.agent.address),
    workerGas: await native(ctx, w.worker.address),
    relayerGas: await native(ctx, w.relayer.address),
  }
}

/** The only thing that decides whether this run PASSED: what actually moved. */
async function settlement(
  ctx: ReturnType<typeof chainCtx>,
  w: Wallets,
  before: Snapshot,
  amount: bigint,
  expectedPayout: bigint,
  expectedFee: bigint,
): Promise<void> {
  const after = await balances(ctx, w)
  const paid = after.workerUsdc - before.workerUsdc
  const fee = after.treasuryUsdc - before.treasuryUsdc
  console.log(`   worker   +${usd(paid)}   (expected +${usd(expectedPayout)})`)
  console.log(`   treasury +${usd(fee)}   (expected +${usd(expectedFee)})`)
  console.log(`   gas — agent ${gas(before.agentGas - after.agentGas)} · worker ${gas(before.workerGas - after.workerGas)} · relayer ${gas(before.relayerGas - after.relayerGas)}`)
  const problems: string[] = []
  if (paid !== expectedPayout) problems.push(`worker payout ${paid} != ${expectedPayout}`)
  if (fee !== expectedFee) problems.push(`treasury fee ${fee} != ${expectedFee}`)
  if (paid + fee !== amount) problems.push('payout + fee != amount')
  if (problems.length > 0) throw new Error(`SETTLEMENT MISMATCH:\n  - ${problems.join('\n  - ')}`)
}

main().catch((err: unknown) => {
  console.error('\n❌', err instanceof Error ? err.message : err)
  process.exit(1)
})
