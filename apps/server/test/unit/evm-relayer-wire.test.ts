/**
 * What `viemEvmRelayer` puts ON THE WIRE, against a stub JSON-RPC node on a
 * real socket: the probe's eth_call and how it reads the answer, the
 * simulate-as-relayer `from`, and the per-call budget (a node that answers
 * late is a timeout, never a hung fund request). The anvil suite proves the
 * relay lands; this proves the calls the relayer makes to get there.
 */
import { after, before, test } from 'node:test'
import * as assert from 'node:assert'
import { encodeFunctionData, parseAbi, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { RECEIVE_WITH_AUTHORIZATION_TYPEHASH } from '@server/chains/evm/relay/authorization'
import { viemEvmRelayer } from '@server/chains/evm/relay/relayer'
import { startStubRpc, type StubRpc } from '../helpers/stub-rpc'

const CHAIN_ID = 'eip155:84532'
const KEY = `0x${'59'.repeat(32)}` as const
const TOKEN = `0x${'a5'.repeat(20)}` as const
const OTHER_TYPEHASH = `0x${'77'.repeat(32)}` as const
const PROBE_DATA = encodeFunctionData({ abi: parseAbi(['function RECEIVE_WITH_AUTHORIZATION_TYPEHASH() view returns (bytes32)']), functionName: 'RECEIVE_WITH_AUTHORIZATION_TYPEHASH' })

let rpc: StubRpc
let typehash: Hex | null = RECEIVE_WITH_AUTHORIZATION_TYPEHASH
let delay_ms = 0

before(async () => {
  rpc = await startStubRpc(async (method) => {
    if (delay_ms > 0) await new Promise((r) => setTimeout(r, delay_ms))
    if (method === 'eth_call') return typehash ?? '0x'
    return undefined
  })
})
after(async () => { await rpc.close() })

const relayer = () => viemEvmRelayer({
    rpc_url: rpc.url,
    // One stub node: this suite asserts what goes ON THE WIRE.
    rpc_url_fallback: undefined,
    chain_id: CHAIN_ID,
    private_key: KEY,
    timeout_ms: 200,
  })

test('the probe is one eth_call of the typehash getter, true only for the canonical constant', async () => {
  assert.strictEqual(relayer().address, privateKeyToAccount(KEY).address)
  assert.strictEqual(await relayer().supportsReceiveWithAuthorization(TOKEN), true)
  const [probe] = rpc.callsTo('eth_call')
  assert.deepStrictEqual(probe?.params[0], { data: PROBE_DATA, to: TOKEN })
  typehash = OTHER_TYPEHASH
  assert.strictEqual(await relayer().supportsReceiveWithAuthorization(TOKEN), false, 'a different constant is not EIP-3009')
  typehash = null
  assert.strictEqual(await relayer().supportsReceiveWithAuthorization(TOKEN), false, 'no getter (empty return) is not EIP-3009')
  typehash = RECEIVE_WITH_AUTHORIZATION_TYPEHASH
})

test('simulate is an eth_call FROM the relayer account', async () => {
  await relayer().simulate({ to: TOKEN, data: '0x1234' })
  const call = rpc.callsTo('eth_call').at(-1)
  assert.deepStrictEqual(call?.params[0], { data: '0x1234', from: privateKeyToAccount(KEY).address, to: TOKEN })
})

test('a node that answers late is a timeout, not a hung request', { timeout: 5_000 }, async () => {
  delay_ms = 600
  try {
    await assert.rejects(relayer().simulate({ to: TOKEN, data: '0x1234' }), /took too long|timed out/i)
    assert.strictEqual(await relayer().supportsReceiveWithAuthorization(TOKEN), false, 'the probe reads a timeout as "not supported"')
  } finally {
    delay_ms = 0
  }
})
