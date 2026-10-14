/**
 * WHAT A SEED HAS TO COVER (#53b item 1) — measured against real bytecode, and
 * turned into a guard rather than a note.
 *
 * The manifest's `gasSeedAmountRaw` was a round placeholder with a comment
 * saying so. A number nobody measures drifts in one direction only: the day a
 * contract call gets more expensive, the grant quietly stops covering the
 * lifecycle and a first-time user meets that as a failed transaction — which is
 * the exact experience the seed exists to prevent.
 *
 * The measurement has three parts, and only one of them can live in a test:
 *
 *  1. GAS UNITS — measured here, by running the user-signed lifecycle
 *     (approve → create → accept → submit → approve completion) against the
 *     real TendaEscrow on anvil and summing the receipts.
 *  2. GAS PRICE — cannot be measured from a test: anvil's price is a fiction
 *     and 0G's is a live fact. OBSERVED from Galileo's public RPC and recorded
 *     in the shared manifest beside the amount it justifies, with the date.
 *  3. A SAFETY MULTIPLE, because a user who is one transaction short is exactly
 *     as stuck as one with nothing.
 *
 * So this file asserts the seed covers `units × recorded price × multiple`. If
 * the lifecycle gets dearer, this fails and names the new figure.
 */
import { after, before, test } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { GAS_SEED_LIFECYCLE_MULTIPLE, OBSERVED_GAS_PRICE_WEI, chainById } from '@tenda/shared'
import { evmAdapter } from '@server/chains/evm'
import type { UnsignedTx } from '@server/chains/types'
import {
  ANVIL_CHAIN_ID,
  ERC20_ABI,
  anvilSkip,
  sendUnsigned as sendUnsignedOn,
  startAnvilFixture,
  type AnvilFixture,
  type AnvilWallet,
} from '../helpers/anvil'

const skip = anvilSkip
const PORT = 8575
const AMOUNT = '25000000' // 25 USDC

/** The chain this budget is measured FOR — the one carrying a seed today. */
const SEEDED_CHAIN = 'eip155:16602'

let fx: AnvilFixture
let adapter: ReturnType<typeof evmAdapter>

const sendUnsigned = (wallet: AnvilWallet, unsigned: UnsignedTx) => sendUnsignedOn(fx, wallet, unsigned)

before(async () => {
  if (skip) return
  fx = await startAnvilFixture(PORT)
  adapter = evmAdapter({
    chain_id: ANVIL_CHAIN_ID,
    rpc_url: fx.rpc_url,
    escrow_contract: fx.escrowAddr,
    min_confirmations: 0,
    deps: {
      resolveWalletAddress: async (user_id) => (user_id === 'worker' ? fx.worker.address : fx.creator.address),
      resolveAsset: async () => ({ token_address: fx.tokenAddr }),
      verifyWalletOwnership: async () => true,
    },
  })
})

after(() => {
  fx?.kill()
})

function createPayload(escrow_id: string) {
  return {
    escrow_id,
    kind: 'gig' as const,
    asset: 'USDC_BASE',
    amount_raw: AMOUNT,
    accept_deadline_unix: Math.floor(Date.now() / 1000) + 3_600,
    completion_duration_seconds: 7_200,
    dispute_bond_raw: '0',
    is_seeker: false,
    requires_approval: false,
    unassign_window_seconds: 0,
  }
}

/** Send an unsigned tx and return what it actually cost in gas units. */
async function gasFor(wallet: AnvilWallet, unsigned: UnsignedTx): Promise<bigint> {
  const hash = await sendUnsigned(wallet, unsigned)
  const receipt = await fx.pub.waitForTransactionReceipt({ hash })
  assert.strictEqual(receipt.status, 'success', 'a reverted step measures nothing')
  return receipt.gasUsed
}

test('the user-signed lifecycle fits inside the seed, at the observed 0G gas price', { skip }, async () => {
  const escrow_id = randomUUID()

  // 1. approve — the fallback path, which is the EXPENSIVE one. A user whose
  //    wallet cannot sign an EIP-2612 permit pays for this extra transaction,
  //    and the seed has to cover the worst case a real wallet produces, not the
  //    best one.
  const unsignedCreate = await adapter.buildTx({
    action: 'createEscrow',
    user_id: 'creator',
    payload: createPayload(escrow_id),
  })
  assert.ok(unsignedCreate.kind === 'evm-tx' && unsignedCreate.approval !== undefined)
  const approveHash = await fx.creatorWallet.writeContract({
    address: unsignedCreate.approval.token as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [unsignedCreate.approval.spender as `0x${string}`, BigInt(unsignedCreate.approval.amount_raw)],
  })
  const approveGas = (await fx.pub.waitForTransactionReceipt({ hash: approveHash })).gasUsed

  // 2-5. create, accept, submit, approve completion — every step a PARTY signs.
  //      Dispute is excluded on purpose: it is not on the path a funded user
  //      needs, and sizing the grant for it would inflate every grant to pay
  //      for the rare case.
  const createGas = await gasFor(fx.creatorWallet, unsignedCreate)
  const acceptGas = await gasFor(
    fx.workerWallet,
    await adapter.buildTx({ action: 'acceptEscrow', user_id: 'worker', payload: { escrow_id } }),
  )
  const submitGas = await gasFor(
    fx.workerWallet,
    await adapter.buildTx({
      action: 'submitProof',
      user_id: 'worker',
      // A full 32-byte hash: the contract stores it, and a shorter value would
      // measure a cheaper write than production performs.
      payload: { escrow_id, proof_hash: `0x${'ab'.repeat(32)}` },
    }),
  )
  const approveCompletionGas = await gasFor(
    fx.creatorWallet,
    await adapter.buildTx({ action: 'approveCompletion', user_id: 'creator', payload: { escrow_id } }),
  )

  // A WORKER's share is what the seed must cover: accept + submit. The creator
  // funds an escrow and is therefore not the person who arrives with nothing.
  // Measured together anyway, because the number that matters is the largest
  // side, and a change on either side should be visible here.
  const workerUnits = acceptGas + submitGas
  const creatorUnits = approveGas + createGas + approveCompletionGas
  const worstSide = workerUnits > creatorUnits ? workerUnits : creatorUnits

  const required = worstSide * OBSERVED_GAS_PRICE_WEI[SEEDED_CHAIN] * GAS_SEED_LIFECYCLE_MULTIPLE
  const granted = BigInt(chainById(SEEDED_CHAIN).gasSeedAmountRaw ?? '0')

  // PRINTED, not just asserted. The runbook (§4.6.2) and the manifest both cite
  // these figures, and the instruction for a new chain is "observe its gas
  // price, then re-run this test to re-derive the amount". That instruction is
  // only followable if the test says what it measured — an assertion that
  // passes silently leaves the next person to re-derive the units by hand.
  console.log(
    `[gas budget] worker ${workerUnits} gas (accept ${acceptGas} + submit ${submitGas}); ` +
      `creator ${creatorUnits} gas (approve ${approveGas} + create ${createGas} + ` +
      `approveCompletion ${approveCompletionGas}); worst side ${worstSide}; ` +
      `required ${required} wei; granted ${granted} wei`,
  )

  assert.ok(
    granted >= required,
    `the ${SEEDED_CHAIN} seed is ${granted} wei but the lifecycle needs ${required} wei ` +
      `(worst side ${worstSide} gas × ${OBSERVED_GAS_PRICE_WEI[SEEDED_CHAIN]} wei/gas × ${GAS_SEED_LIFECYCLE_MULTIPLE}). ` +
      `Raise gasSeedAmountRaw in the manifest, or re-observe the gas price if the chain has changed.`,
  )

  // And not absurdly generous either: a grant far above the need is real money
  // handed out per user, and the placeholder was chosen with no measurement at
  // all. 50× the requirement is the line between headroom and waste.
  assert.ok(
    granted <= required * 50n,
    `the ${SEEDED_CHAIN} seed is ${granted} wei against a measured need of ${required} — that is not headroom, it is a gift`,
  )
})

test('every seed-bearing chain has an observed gas price behind its amount', { skip }, async () => {
  // The guard against the failure this whole file exists to prevent: a chain
  // gaining `gasSeedAmountRaw` with a number someone guessed. If a chain
  // declares a seed, its price has to have been observed and recorded.
  const seeded = Object.keys(OBSERVED_GAS_PRICE_WEI)
  for (const chain_id of seeded) {
    const entry = chainById(chain_id)
    assert.ok(
      entry.gasSeedAmountRaw !== undefined,
      `${chain_id} has an observed gas price but declares no seed — remove one or add the other`,
    )
  }
})
