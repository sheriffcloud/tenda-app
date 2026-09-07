/**
 * On-chain proof of relayed funding (#18) on an EVM testnet: an agent EOA
 * that holds the escrow's stablecoin and ZERO gas funds an escrow through the
 * server's REAL adapter — quote → eth_signTypedData_v4 → relay — with the
 * relayer hot wallet sending `createEscrowFor` and paying the gas.
 *
 *   RELAY_SMOKE_AGENT_KEY=0x<32-byte hex> \
 *     pnpm --filter tenda-server verify:relayed-funding-evm [chain_id=eip155:16602] [amount=1000000]
 *
 * Chain config is the server's own (`CHAIN_<ID>_RPC_URL`, `_ESCROW_ADDR`,
 * `_RELAYER_KEY` from .env; the token from the shared manifest), so what this
 * proves is the deployed configuration. The agent must hold ≥ amount of the
 * chain's gig asset; it needs NO native gas — that is the whole claim. No DB
 * row is written: chain half only, like verify-relayed-funding (Solana).
 */

import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { createPublicClient, formatUnits, http, parseAbi, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { TENDA_RELAY_SCHEME, X402_VERSION, chainById, gigAssetByChain } from '@tenda/shared'
import { evmAdapter } from '@server/chains/evm'
import { escrowIdHex } from '@server/chains/evm/create-params'
import { viemEvmRelayer } from '@server/chains/evm/relay/relayer'
import { chainEnvPrefix } from '@server/chains/secrets/schema'
import type { CreateEscrowPayload } from '@server/chains/types'

const DEFAULT_CHAIN_ID = 'eip155:16602'
const DEFAULT_AMOUNT_RAW = '1000000'
const CONFIRM_ATTEMPTS = 30
const CONFIRM_INTERVAL_MS = 2_000
const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'])

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}
function requireEnv(name: string): string {
  const v = process.env[name]
  assert(v !== undefined && v !== '', `${name} is not set`)
  return v
}
function requireHexKey(name: string): Hex {
  const v = requireEnv(name)
  assert(/^0x[0-9a-fA-F]{64}$/.test(v), `${name} must be a 0x-prefixed 32-byte hex key`)
  return v as Hex
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function main(): Promise<void> {
  const chain_id = process.argv[2] ?? DEFAULT_CHAIN_ID
  const amount_raw = process.argv[3] ?? DEFAULT_AMOUNT_RAW
  assert(/^[1-9]\d*$/.test(amount_raw), 'amount must be a positive base-unit integer')
  const entry = chainById(chain_id)
  const asset_id = gigAssetByChain(chain_id)
  assert(asset_id !== null, `${chain_id} has no gig asset in the manifest`)
  const token = entry.assets.find((a) => a.id === asset_id)?.token
  assert(token != null, `${asset_id} on ${chain_id} has no manifest token address`)
  const prefix = chainEnvPrefix(chain_id)
  const rpc_url = requireEnv(`${prefix}_RPC_URL`)
  const escrow_contract = requireEnv(`${prefix}_ESCROW_ADDR`) as Hex
  const agent = privateKeyToAccount(requireHexKey('RELAY_SMOKE_AGENT_KEY'))
  const relayer = viemEvmRelayer({ rpc_url, chain_id, private_key: requireHexKey(`${prefix}_RELAYER_KEY`) })
  const adapter = evmAdapter({
    chain_id,
    rpc_url,
    escrow_contract,
    min_confirmations: entry.minConfirmations,
    deps: {
      resolveWalletAddress: async () => agent.address,
      resolveAsset: async (asset) => {
        assert(asset === asset_id, `this smoke funds the gig asset only (got '${asset}')`)
        return { token_address: token }
      },
      relayer,
    },
  })
  assert(adapter.relay !== undefined, 'adapter offers no relay surface')
  const pub = createPublicClient({ transport: http(rpc_url) })
  const tokenAddr = token as Hex
  const decimals = await pub.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: 'decimals' })
  const usdcOf = (owner: Hex): Promise<bigint> => pub.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [owner] })
  const fmt = (v: bigint): string => `${formatUnits(v, decimals)} ${asset_id}`

  console.log(`Chain   : ${entry.displayName} (${chain_id}) via ${rpc_url}`)
  console.log(`Escrow  : ${escrow_contract}   token ${tokenAddr}`)
  console.log(`Relayer : ${relayer.address}`)
  console.log(`Agent   : ${agent.address}`)

  // ---- 1. balances BEFORE: the agent has the stablecoin and NO gas ----------
  const [agentUsdcBefore, agentGasBefore, relayerGasBefore] = await Promise.all([
    usdcOf(agent.address), pub.getBalance({ address: agent.address }), pub.getBalance({ address: relayer.address }),
  ])
  console.log(`\nBefore  : agent ${fmt(agentUsdcBefore)} + ${formatUnits(agentGasBefore, 18)} gas, relayer ${formatUnits(relayerGasBefore, 18)} gas`)
  assert(agentUsdcBefore >= BigInt(amount_raw), `agent holds less than the amount — fund ${agent.address} with ≥ ${fmt(BigInt(amount_raw))}`)
  assert(relayerGasBefore > 0n, `relayer ${relayer.address} holds no gas`)

  // ---- 2. quote → sign → relay (exactly what POST /v1/escrows/:id/fund does) -
  const escrow_id = randomUUID()
  const payload: CreateEscrowPayload = {
    escrow_id,
    kind: 'gig',
    asset: asset_id,
    amount_raw,
    accept_deadline_unix: Math.floor(Date.now() / 1000) + 3_600,
    completion_duration_seconds: 3_600,
    dispute_bond_raw: '0',
    is_seeker: false,
    requires_approval: false,
    unassign_window_seconds: 0,
  }
  const args = { user_id: 'relay-smoke', creator_address: agent.address, payload }
  const terms = await adapter.relay.quote(args)
  assert(terms.payment.kind === 'eip155-authorization', 'expected eip155-authorization terms')
  const typed = terms.payment.typed_data
  console.log(`\nQuoted  : escrow ${escrow_id}, nonce ${typed.message.nonce}, validBefore ${typed.message.validBefore}`)
  // The ONLY thing the agent does: eth_signTypedData_v4 over the quoted terms. No gas.
  const signature = await agent.signTypedData({
    domain: { ...typed.domain, verifyingContract: typed.domain.verifyingContract as Hex },
    types: { ReceiveWithAuthorization: typed.types.ReceiveWithAuthorization },
    primaryType: 'ReceiveWithAuthorization',
    message: {
      from: typed.message.from as Hex, to: typed.message.to as Hex, value: BigInt(typed.message.value),
      validAfter: BigInt(typed.message.validAfter), validBefore: BigInt(typed.message.validBefore), nonce: typed.message.nonce as Hex,
    },
  })
  const m = typed.message
  const { tx_ref } = await adapter.relay.relay({
    ...args,
    payment: {
      x402Version: X402_VERSION,
      scheme: TENDA_RELAY_SCHEME,
      network: chain_id,
      payload: { signature, authorization: { from: m.from, to: m.to, value: m.value, validAfter: m.validAfter, validBefore: m.validBefore, nonce: m.nonce } },
    },
  })
  console.log(`Relayed : ${tx_ref}\n          ${entry.explorerUrl ?? ''}/tx/${tx_ref}`)

  // ---- 3. the ordinary verify pipeline confirms it -------------------------
  let confirmed = false
  for (let i = 0; i < CONFIRM_ATTEMPTS && !confirmed; i += 1) {
    await sleep(CONFIRM_INTERVAL_MS)
    const verified = await adapter.verifyTx(tx_ref, { expected_event: 'EscrowCreated', escrow_id })
    if (!verified.confirmed) continue
    assert(verified.failed !== true, `transaction failed on-chain: ${JSON.stringify(verified)}`)
    assert('event' in verified && verified.event !== undefined, 'confirmed without a decoded EscrowCreated')
    const actor = verified.event.actor ?? ''
    assert(actor.toLowerCase() === `${chain_id}:${agent.address}`.toLowerCase(), `event actor is '${actor}', not the agent`)
    confirmed = true
  }
  assert(confirmed, `not confirmed after ${(CONFIRM_ATTEMPTS * CONFIRM_INTERVAL_MS) / 1000}s`)
  const state = await adapter.fetchEscrowState(escrowIdHex(escrow_id))
  assert(state !== null && state.creator_address.toLowerCase() === agent.address.toLowerCase(), 'on-chain escrow creator is not the agent')
  assert(state.amount_raw === amount_raw && state.status === 'open', `unexpected on-chain state ${JSON.stringify(state)}`)

  // ---- 4. balances AFTER: agent paid the amount and nothing else -----------
  const [agentUsdcAfter, agentGasAfter, relayerGasAfter, escrowUsdc] = await Promise.all([
    usdcOf(agent.address), pub.getBalance({ address: agent.address }), pub.getBalance({ address: relayer.address }), usdcOf(escrow_contract),
  ])
  console.log(`After   : agent ${fmt(agentUsdcAfter)} + ${formatUnits(agentGasAfter, 18)} gas, relayer ${formatUnits(relayerGasAfter, 18)} gas`)
  assert(agentUsdcBefore - agentUsdcAfter === BigInt(amount_raw), 'agent paid something other than exactly the amount')
  assert(agentGasAfter === agentGasBefore, 'the agent paid gas — the relayer did not')
  assert(relayerGasAfter < relayerGasBefore, 'relayer paid nothing — it was not the sender')
  assert(escrowUsdc >= BigInt(amount_raw), 'the escrow contract did not receive the amount')
  console.log(`  → agent paid   : ${fmt(agentUsdcBefore - agentUsdcAfter)}, gas 0`)
  console.log(`  → relayer paid : ${formatUnits(relayerGasBefore - relayerGasAfter, 18)} gas`)
  console.log(`\n✓ PROVEN on ${chain_id}: escrow ${escrow_id} is open with the agent as creator; the relayer paid the gas.`)
}

main().catch((err: unknown) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
