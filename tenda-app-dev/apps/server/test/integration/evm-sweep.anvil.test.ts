/**
 * The abandoned-escrow sweep (#43) against a REAL node, end to end.
 *
 * The unit suites prove the server's decisions and the forge suite proves the
 * contract's rules; only this one proves the two agree — that the calldata the
 * server builds, signed by the RELAYER and sent to the escrow's own contract,
 * actually moves a stranded creator's funds back to them.
 *
 * The scenario is the one the ticket is about: an escrow is funded and then
 * nobody does anything, ever. No accept, no refund, no creator coming back. On
 * the pre-#43 contract this ends with the money sitting in the contract for
 * good; here the platform finishes it for them.
 */
import { after, before, test } from 'node:test'
import * as assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { evmAdapter } from '@server/chains/evm'
import { viemEvmRelayer } from '@server/chains/evm/relay/relayer'
import type { CreateEscrowPayload } from '@server/chains/types'
import {
  ANVIL_CHAIN_ID,
  ANVIL_GRACE_SECONDS,
  ANVIL_KEYS,
  ERC20_ABI,
  anvilSkip,
  sendUnsigned,
  startAnvilFixture,
  type AnvilFixture,
} from '../helpers/anvil'

const skip = anvilSkip
const PORT = 8573
const AMOUNT = '1000000'
const ACCEPT_WINDOW_SECONDS = 12 * 60 * 60
const COMPLETION_SECONDS = 3_600

let fx: AnvilFixture
let adapter: ReturnType<typeof evmAdapter>
let relayerAddress: `0x${string}`

before(async () => {
  if (skip) return
  fx = await startAnvilFixture(PORT)
  const relayer = viemEvmRelayer({
    rpc_url: fx.rpc_url,
    chain_id: ANVIL_CHAIN_ID,
    private_key: ANVIL_KEYS.relayer,
  })
  relayerAddress = relayer.address
  adapter = evmAdapter({
    chain_id: ANVIL_CHAIN_ID,
    rpc_url: fx.rpc_url,
    escrow_contract: fx.escrowAddr,
    min_confirmations: 0,
    deps: {
      resolveWalletAddress: async () => fx.creator.address,
      resolveAsset: async () => ({ token_address: fx.tokenAddr }),
      relayer,
      // #43's flag, opt-in per chain: without it this adapter would offer no
      // sweep port at all, which is exactly what the unit gate asserts.
      sweepEnabled: true,
    },
  })
})

after(() => {
  if (!skip) fx.kill()
})

function creatorBalance(): Promise<bigint> {
  return fx.pub.readContract({
    address: fx.tokenAddr,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [fx.creator.address],
  })
}

/** Fund an escrow as the creator, exactly as the app's own create flow does. */
async function fundEscrow(escrow_id: string): Promise<void> {
  // A plain ERC-20 create pulls with transferFrom, so the allowance comes
  // first — the same approve the wallet does before broadcasting.
  const approval = await fx.creatorWallet.writeContract({
    address: fx.tokenAddr,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [fx.escrowAddr, BigInt(AMOUNT)],
  })
  await fx.pub.waitForTransactionReceipt({ hash: approval })

  // The CHAIN's clock, not the wall clock: an earlier test in this file warps
  // anvil forward, and a deadline measured from `Date.now()` would already be
  // in the contract's past by the time it is validated.
  const { timestamp } = await fx.pub.getBlock()
  const now = Number(timestamp)
  const payload: CreateEscrowPayload = {
    escrow_id,
    kind: 'gig',
    asset: 'USDC_BASE',
    amount_raw: AMOUNT,
    accept_deadline_unix: now + ACCEPT_WINDOW_SECONDS,
    completion_duration_seconds: COMPLETION_SECONDS,
    dispute_bond_raw: '0',
    requires_approval: false,
    unassign_window_seconds: 0,
    is_seeker: false,
  }
  const unsigned = await adapter.buildTx({
    action: 'createEscrow',
    user_id: 'creator',
    payload,
  })
  await sendUnsigned(fx, fx.creatorWallet, unsigned)
}

/** Take the job as the worker, exactly as the app's accept flow does. */
async function acceptEscrow(escrow_id: string): Promise<void> {
  const unsigned = await adapter.buildTx({
    action: 'acceptEscrow',
    user_id: 'worker',
    payload: { escrow_id },
  })
  await sendUnsigned(fx, fx.workerWallet, unsigned)
}

async function statusOf(escrow_id: string): Promise<string> {
  // The chain holds the id as 16 raw bytes; the same spelling the lifecycle
  // suite uses to read a state back.
  const state = await adapter.fetchEscrowState(`0x${escrow_id.replace(/-/g, '')}`)
  assert.ok(state, 'the escrow must exist on chain')
  return state.status
}

test('a stranded escrow is swept back to its creator by the RELAYER', { skip }, async () => {
  const escrow_id = randomUUID()
  await fundEscrow(escrow_id)
  assert.strictEqual(await statusOf(escrow_id), 'open', 'funded and open')
  // Measured AFTER funding: the creator is now out of pocket by AMOUNT, which
  // is exactly what the sweep has to give back.
  const strandedBalance = await creatorBalance()

  // Nobody accepts, and the window closes.
  await fx.node.increaseTime({ seconds: ACCEPT_WINDOW_SECONDS + 60 })
  await fx.node.mine({ blocks: 1 })

  assert.ok(adapter.sweep, 'an EVM chain with a relayer offers the sweep port')
  const { tx_ref } = await adapter.sweep.sweep({
    escrow_id,
    creator_user_id: 'creator',
    transition: 'refund_expired',
    escrow_contract: fx.escrowAddr,
  })
  const receipt = await fx.pub.waitForTransactionReceipt({ hash: tx_ref as `0x${string}` })

  assert.strictEqual(receipt.status, 'success')
  // The RELAYER paid for it — the creator signed nothing and spent nothing.
  assert.strictEqual(receipt.from.toLowerCase(), relayerAddress.toLowerCase())
  assert.strictEqual(await statusOf(escrow_id), 'refunded')
  assert.strictEqual(
    (await creatorBalance()) - strandedBalance,
    BigInt(AMOUNT),
    'every unit came back to the creator, who signed nothing',
  )

  // And the SERVER reads it back the same way. The decoded actor comes from the
  // event's `creator` arg, not from `tx.from` — so the refund lands in the
  // creator's history rather than being recorded as something the relayer did
  // to them. Deriving the actor from the sender would look correct on every
  // user-signed transition and be wrong on exactly this one.
  const verified = await adapter.verifyTx(tx_ref, { expected_event: 'EscrowExpired', escrow_id })
  assert.strictEqual(verified.confirmed, true)
  assert.strictEqual(verified.failed, false)
  const actor = verified.event?.actor?.toLowerCase() ?? ''
  assert.ok(
    actor.endsWith(fx.creator.address.toLowerCase()),
    `the sweep is attributed to the creator, got ${actor}`,
  )
  assert.ok(
    !actor.endsWith(relayerAddress.toLowerCase()),
    'and never to the wallet that merely paid the gas',
  )
})

test('the sweeper refuses BEFORE broadcasting when the window is still open', { skip }, async () => {
  // The simulation is what keeps a doomed call off the chain. Without it every
  // tick would burn gas on a guaranteed revert, forever, for every escrow that
  // is not yet eligible.
  const escrow_id = randomUUID()
  await fundEscrow(escrow_id)

  assert.ok(adapter.sweep)
  await assert.rejects(
    adapter.sweep.sweep({
      escrow_id,
      creator_user_id: 'creator',
      transition: 'refund_expired',
      escrow_contract: fx.escrowAddr,
    }),
    'the accept deadline has not passed, so the call must not be sent',
  )
  assert.strictEqual(await statusOf(escrow_id), 'open', 'and the escrow is untouched')
})

test('a ghosted engagement is swept, and credited to the CREATOR not the worker', { skip }, async () => {
  // The sweeper's OTHER transition, and the one whose event carries a second
  // address: EscrowAbandoned(escrowId, creator, counterparty, amount). Nothing
  // else in the suite decodes it, so a decoder that reached for the wrong
  // address — the first non-indexed one, say — would attribute the creator's
  // refund to the very worker who ghosted them, on every reclaim, silently.
  // EscrowExpired cannot catch that: its only address is the indexed creator.
  const escrow_id = randomUUID()
  await fundEscrow(escrow_id)
  await acceptEscrow(escrow_id)
  assert.strictEqual(await statusOf(escrow_id), 'accepted', 'the worker took the job')
  const strandedBalance = await creatorBalance()

  // The worker then delivers nothing, through the whole window AND the grace
  // period past it — the boundary at which submitProof stops accepting work.
  await fx.node.increaseTime({ seconds: COMPLETION_SECONDS + ANVIL_GRACE_SECONDS + 60 })
  await fx.node.mine({ blocks: 1 })

  assert.ok(adapter.sweep)
  const { tx_ref } = await adapter.sweep.sweep({
    escrow_id,
    creator_user_id: 'creator',
    transition: 'reclaim_abandoned',
    escrow_contract: fx.escrowAddr,
  })
  await fx.pub.waitForTransactionReceipt({ hash: tx_ref as `0x${string}` })

  assert.strictEqual(await statusOf(escrow_id), 'refunded')
  assert.strictEqual(
    (await creatorBalance()) - strandedBalance,
    BigInt(AMOUNT),
    'the whole amount goes back to the creator',
  )

  const verified = await adapter.verifyTx(tx_ref, { expected_event: 'EscrowAbandoned', escrow_id })
  assert.strictEqual(verified.confirmed, true)
  assert.strictEqual(verified.failed, false)
  const actor = verified.event?.actor?.toLowerCase() ?? ''
  assert.ok(
    actor.endsWith(fx.creator.address.toLowerCase()),
    `the refund belongs to the creator's history, got ${actor}`,
  )
  assert.ok(
    !actor.endsWith(fx.worker.address.toLowerCase()),
    'and never to the counterparty who is named in the same event',
  )
})
