/**
 * On-chain proof of relayed funding (#18) on Solana devnet: an agent keypair
 * that holds the escrow amount and NOTHING for rent or fees funds a
 * native-SOL escrow through the server's REAL adapter — quote → sign → relay —
 * with the relayer hot wallet as fee payer, fronting only the rent shortfall.
 *
 *   RELAY_SMOKE_AGENT_KEY=<base58 64-byte secret> \
 *     pnpm --filter tenda-server verify:relayed-funding [amount_sol=0.01]
 *
 * The relayer is the one the server boots with (`CHAIN_SOLANA_DEVNET_RPC_URL`
 * + `CHAIN_SOLANA_DEVNET_RELAYER_KEY` from .env), so what this proves is the
 * deployed configuration, not a fixture. The agent must hold ≥ amount SOL; it
 * needs no more — the shortfall rule (relay/index.ts) fronts the rest. No DB
 * row is written: this is the chain half, like verify-celo-feecurrency.
 */

import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { Program } from '@coral-xyz/anchor'
import { Connection, Keypair, LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js'
import bs58 from 'bs58'
import { TENDA_RELAY_SCHEME, X402_VERSION, solanaNativeAssetId, solanaPublicRpcUrl } from '@tenda/shared'
import { ESCROW_IDL, type TendaEscrow } from '@tenda/shared/idl'
import { solanaAdapter } from '@server/chains/solana'
import { escrowPdaFromUuid } from '@server/chains/solana/pdas'
import { web3SolanaRelayer } from '@server/chains/solana/relay/relayer'
import { commitmentFor } from '@server/chains/solana/rpc'
import type { CreateEscrowPayload } from '@server/chains/types'

const CHAIN_ID = 'solana:devnet'
const NATIVE_ASSET = solanaNativeAssetId('devnet')
const DEFAULT_AMOUNT_SOL = 0.01
const CONFIRM_ATTEMPTS = 30
const CONFIRM_INTERVAL_MS = 2_000

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function requireBase58Key(name: string): string {
  const raw = process.env[name]
  assert(raw !== undefined && raw !== '', `${name} is not set`)
  assert(bs58.decode(raw).length === 64, `${name} must be a base58 64-byte secret key`)
  return raw
}

const sol = (lamports: bigint): string => `${Number(lamports) / LAMPORTS_PER_SOL} SOL`
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function main(): Promise<void> {
  const rpc_url = process.env.CHAIN_SOLANA_DEVNET_RPC_URL ?? solanaPublicRpcUrl(CHAIN_ID)
  assert(rpc_url !== null, `no RPC url for ${CHAIN_ID}`)
  const relayer_key = requireBase58Key('CHAIN_SOLANA_DEVNET_RELAYER_KEY')
  const agent = Keypair.fromSecretKey(bs58.decode(requireBase58Key('RELAY_SMOKE_AGENT_KEY')))
  const amount_sol = Number(process.argv[2] ?? DEFAULT_AMOUNT_SOL)
  assert(Number.isFinite(amount_sol) && amount_sol > 0, 'amount_sol must be a positive number')
  const amount = BigInt(Math.round(amount_sol * LAMPORTS_PER_SOL))

  const relayer = web3SolanaRelayer({
    rpc_url,
    // A one-off verification run against ONE endpoint, by hand — redundancy is
    // not what this script is checking. Stated explicitly because the parameter
    // is a required key precisely so nobody omits it by accident.
    rpc_url_fallback: undefined,
    chain_id: CHAIN_ID,
    secret_key_base58: relayer_key,
  })
  const adapter = solanaAdapter({
    chain_id: CHAIN_ID,
    rpc_url,
    deps: {
      resolveWalletAddress: async () => agent.publicKey.toBase58(),
      resolveAsset: async (asset) => {
        assert(asset === NATIVE_ASSET, `this smoke funds the native asset only (got '${asset}')`)
        return { token_address: null }
      },
      relayer,
    },
  })
  assert(adapter.relay !== undefined, 'adapter offers no relay surface')
  const connection = new Connection(rpc_url, commitmentFor(CHAIN_ID))
  const program = new Program<TendaEscrow>(ESCROW_IDL, { connection })
  const rent = BigInt(await connection.getMinimumBalanceForRentExemption(program.account.escrow.size))

  console.log(`Chain   : ${CHAIN_ID} via ${rpc_url}`)
  console.log(`Relayer : ${relayer.public_key.toBase58()}`)
  console.log(`Agent   : ${agent.publicKey.toBase58()}`)
  console.log(`Amount  : ${sol(amount)}  (escrow rent ${sol(rent)})`)

  // ---- 1. balances BEFORE --------------------------------------------------
  const agentBefore = await relayer.getBalance(agent.publicKey)
  const relayerBefore = await relayer.getBalance(relayer.public_key)
  console.log(`\nBefore  : agent ${sol(agentBefore)}, relayer ${sol(relayerBefore)}`)
  assert(agentBefore >= amount, `agent holds less than the amount — fund ${agent.publicKey.toBase58()} with ≥ ${sol(amount)}`)
  assert(relayerBefore > rent, `relayer holds ${sol(relayerBefore)} — fund ${relayer.public_key.toBase58()} (needs fees + up to one rent)`)

  // ---- 2. quote → sign → relay (exactly what POST /v1/escrows/:id/fund does) -
  const escrow_id = randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const payload: CreateEscrowPayload = {
    escrow_id,
    kind: 'gig',
    asset: NATIVE_ASSET,
    amount_raw: amount.toString(),
    accept_deadline_unix: now + 3_600,
    completion_duration_seconds: 3_600,
    dispute_bond_raw: '0',
    is_seeker: false,
    requires_approval: false,
    unassign_window_seconds: 0,
  }
  const args = { user_id: 'relay-smoke', creator_address: agent.publicKey.toBase58(), payload }
  const terms = await adapter.relay.quote(args)
  assert(terms.payment.kind === 'solana-transaction', 'expected solana-transaction terms')
  console.log(`\nQuoted  : escrow ${escrow_id}, fee payer ${terms.payment.fee_payer}, expires ${terms.expires_at_unix}`)
  const tx = VersionedTransaction.deserialize(Buffer.from(terms.payment.transaction, 'base64'))
  tx.sign([agent]) // the ONLY thing the agent does: one ed25519 signature, no SOL for fees
  const { tx_ref } = await adapter.relay.relay({
    ...args,
    payment: {
      x402Version: X402_VERSION,
      scheme: TENDA_RELAY_SCHEME,
      network: CHAIN_ID,
      payload: { transaction: Buffer.from(tx.serialize()).toString('base64') },
    },
  })
  console.log(`Relayed : ${tx_ref}\n          https://explorer.solana.com/tx/${tx_ref}?cluster=devnet`)

  // ---- 3. the ordinary verify pipeline confirms it -------------------------
  let confirmed = false
  for (let i = 0; i < CONFIRM_ATTEMPTS && !confirmed; i += 1) {
    await sleep(CONFIRM_INTERVAL_MS)
    const verified = await adapter.verifyTx(tx_ref, { expected_event: 'EscrowCreated', escrow_id })
    if (!verified.confirmed) continue
    assert(verified.failed !== true, `transaction failed on-chain: ${JSON.stringify(verified)}`)
    assert('event' in verified && verified.event !== undefined, 'confirmed without a decoded EscrowCreated')
    assert(verified.event.actor === `${CHAIN_ID}:${agent.publicKey.toBase58()}`, `event actor is ${verified.event.actor}, not the agent`)
    confirmed = true
  }
  assert(confirmed, `not confirmed after ${(CONFIRM_ATTEMPTS * CONFIRM_INTERVAL_MS) / 1000}s`)
  const state = await adapter.fetchEscrowState(escrowPdaFromUuid(escrow_id).toBase58())
  assert(state !== null && state.creator_address === agent.publicKey.toBase58(), 'on-chain escrow creator is not the agent')
  assert(state.amount_raw === amount.toString() && state.status === 'open', `unexpected on-chain state ${JSON.stringify(state)}`)

  // ---- 4. balances AFTER: agent paid amount (+ rent only if it had it) ------
  const agentAfter = await relayer.getBalance(agent.publicKey)
  const relayerAfter = await relayer.getBalance(relayer.public_key)
  console.log(`After   : agent ${sol(agentAfter)}, relayer ${sol(relayerAfter)}`)
  // Shortfall rule: fronted = max(0, rent + amount − before) ⇒ after = max(before − amount − rent, 0).
  const expectedAgentAfter = agentBefore > amount + rent ? agentBefore - amount - rent : 0n
  assert(agentAfter === expectedAgentAfter, `agent ended at ${sol(agentAfter)}, expected ${sol(expectedAgentAfter)} — it paid a fee or more than the shortfall rule allows`)
  assert(relayerAfter < relayerBefore, 'relayer paid nothing — it was not the fee payer')
  console.log(`  → agent paid   : ${sol(agentBefore - agentAfter)} (amount${agentBefore > amount + rent ? ' + rent' : ', rent fronted'})`)
  console.log(`  → relayer paid : ${sol(relayerBefore - relayerAfter)} (fee + fronted rent)`)
  console.log(`\n✓ PROVEN on ${CHAIN_ID}: escrow ${escrow_id} is open with the agent as creator; the relayer paid the fees.`)
}

main().catch((err: unknown) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
