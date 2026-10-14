/**
 * getEvmTransactionStatus — the direct-RPC receipt poll behind the tx
 * monitor's fallback. Confirmed/failed/pending mapping and the manifest-
 * resolved endpoint.
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { getEvmTransactionStatus } from '../../src/wallet/evm-tx-status'

let calls: Array<{ url: string; body: string }> = []
let payload: unknown

const realFetch = globalThis.fetch

beforeEach(() => {
  calls = []
  payload = { jsonrpc: '2.0', id: 1, result: null }
  globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') })
    return { json: async () => payload }
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

test('queries the chain-resolved public RPC with eth_getTransactionReceipt', async () => {
  payload = { jsonrpc: '2.0', id: 1, result: { status: '0x1' } }
  await getEvmTransactionStatus('0xtx', 'eip155:84532')
  assert.match(calls[0].url, /^https?:\/\//)
  const body = JSON.parse(calls[0].body) as { method: string; params: string[] }
  assert.strictEqual(body.method, 'eth_getTransactionReceipt')
  assert.deepStrictEqual(body.params, ['0xtx'])
})

test('maps receipt status 0x1 → confirmed and 0x0 → failed', async () => {
  payload = { jsonrpc: '2.0', id: 1, result: { status: '0x1' } }
  assert.strictEqual(await getEvmTransactionStatus('0xtx', 'eip155:84532'), 'confirmed')
  payload = { jsonrpc: '2.0', id: 1, result: { status: '0x0' } }
  assert.strictEqual(await getEvmTransactionStatus('0xtx', 'eip155:84532'), 'failed')
})

test('null receipt, missing result field, and unknown status all read as pending', async () => {
  payload = { jsonrpc: '2.0', id: 1, result: null }
  assert.strictEqual(await getEvmTransactionStatus('0xtx', 'eip155:84532'), 'not_found')
  payload = { jsonrpc: '2.0', id: 1 }
  assert.strictEqual(await getEvmTransactionStatus('0xtx', 'eip155:84532'), 'not_found')
  payload = { jsonrpc: '2.0', id: 1, result: { status: '0x2' } }
  assert.strictEqual(await getEvmTransactionStatus('0xtx', 'eip155:84532'), 'not_found')
})

test('an unknown chain id throws (manifest resolution, never a guessed URL)', async () => {
  await assert.rejects(getEvmTransactionStatus('0xtx', 'eip155:1'))
})
