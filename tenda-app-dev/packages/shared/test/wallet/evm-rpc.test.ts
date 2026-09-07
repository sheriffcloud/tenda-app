/**
 * evm-rpc — the fetch JSON-RPC + ABI-word helpers every client-side EVM read
 * path rides. The word helpers guard calldata correctness: a truncated pad
 * would emit a malformed call, and an oversized amount must throw rather
 * than slip through padStart (which never truncates).
 */
import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert'
import {
  addressWord,
  amountWord,
  evmRpc,
  evmRpcString,
  hexToDecimalString,
} from '../../src/wallet'

let responseBody: unknown
const realFetch = globalThis.fetch
beforeEach(() => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(responseBody), {
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch
})
after(() => {
  globalThis.fetch = realFetch
})

test('evmRpc returns the result, and null for a body with no result / a non-object body', async () => {
  responseBody = { jsonrpc: '2.0', id: 1, result: '0x2a' }
  assert.strictEqual(await evmRpc('http://rpc', 'eth_getBalance', []), '0x2a')

  responseBody = { jsonrpc: '2.0', id: 1, error: { message: 'boom' } }
  assert.strictEqual(await evmRpc('http://rpc', 'eth_getBalance', []), null)

  responseBody = 'not-an-object'
  assert.strictEqual(await evmRpc('http://rpc', 'eth_getBalance', []), null)
})

test('evmRpcString only lets string results through', async () => {
  responseBody = { result: '0xff' }
  assert.strictEqual(await evmRpcString('http://rpc', 'eth_call', []), '0xff')
  responseBody = { result: { objects: 'are not strings' } }
  assert.strictEqual(await evmRpcString('http://rpc', 'eth_call', []), null)
})

test('hexToDecimalString: quantities decode; null/empty/bare-0x/invalid all read as 0', () => {
  assert.strictEqual(hexToDecimalString('0xde0b6b3a7640000'), '1000000000000000000')
  assert.strictEqual(hexToDecimalString(null), '0')
  assert.strictEqual(hexToDecimalString(''), '0')
  assert.strictEqual(hexToDecimalString('0x'), '0')
  assert.strictEqual(hexToDecimalString('0xZZ'), '0') // BigInt throws → caught
})

test('addressWord left-pads a lowercased 20-byte address to a 32-byte word', () => {
  const word = addressWord('0xAbCdEf0123456789aBcDeF0123456789AbCdEf01')
  assert.strictEqual(word.length, 64)
  assert.strictEqual(word, '000000000000000000000000abcdef0123456789abcdef0123456789abcdef01')
})

test('amountWord pads a base-unit amount and THROWS beyond uint256', () => {
  assert.strictEqual(amountWord('50000000'), '2faf080'.padStart(64, '0'))
  const overMax = (2n ** 256n).toString()
  assert.throws(() => amountWord(overMax), RangeError)
  // The max value itself still fits.
  assert.strictEqual(amountWord((2n ** 256n - 1n).toString()).length, 64)
})
