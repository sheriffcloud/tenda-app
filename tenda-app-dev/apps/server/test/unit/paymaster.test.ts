/**
 * chains/evm/paymaster — fetchPaymasterHttp JSON-RPC client + ENTRY_POINT.
 * Fully offline: global `fetch` is stubbed per test (no network). Covers the
 * request shape (pm_sponsorUserOperation envelope, snake→camel userOp), the
 * happy-path field mapping, and every failure branch (HTTP !ok, JSON-RPC
 * error, missing/typed gas fields). Adversarial: a valid result alongside an
 * explicit `error: null` must NOT 502.
 */

import { test, afterEach } from 'node:test'
import * as assert from 'node:assert'
import { fetchPaymasterHttp, ENTRY_POINT_V06 } from '@server/chains/evm/paymaster'
import { AppError } from '@server/lib/errors'
import type { UserOperation } from '@server/chains/types'

const URL = 'https://paymaster.test/rpc'
const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

interface FetchCall {
  url: string
  body: Record<string, unknown>
}

/** Stub global fetch with a canned Response; capture the outgoing request. */
function stubFetch(response: {
  ok?: boolean
  status?: number
  json: () => Promise<unknown>
}): FetchCall[] {
  const calls: FetchCall[] = []
  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    calls.push({ url: String(url), body: JSON.parse(init?.body ?? '{}') })
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: response.json,
    } as Response
  }) as typeof fetch

  return calls
}

const GOOD_RESULT = {
  paymasterAndData: '0xfeed',
  preVerificationGas: '0x1',
  verificationGasLimit: '0x2',
  callGasLimit: '0x3',
}

const USER_OP: Partial<UserOperation> = {
  sender: '0xabc',
  call_data: '0xdead',
  // nonce intentionally omitted to prove undefined fields are dropped
}

test('ENTRY_POINT_V06 is the canonical v0.6 EntryPoint address', () => {
  assert.strictEqual(ENTRY_POINT_V06, '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789')
})

test('success: posts the pm_sponsorUserOperation envelope and maps gas fields', async () => {
  const calls = stubFetch({ json: async () => ({ result: GOOD_RESULT }) })
  const res = await fetchPaymasterHttp(URL).sponsorUserOperation(USER_OP, ENTRY_POINT_V06)

  // request envelope
  assert.strictEqual(calls.length, 1)
  assert.strictEqual(calls[0].url, URL)
  assert.strictEqual(calls[0].body.jsonrpc, '2.0')
  assert.strictEqual(calls[0].body.method, 'pm_sponsorUserOperation')
  const params = calls[0].body.params as [Record<string, string>, string]
  assert.strictEqual(params[1], ENTRY_POINT_V06)
  // snake→camel mapping, undefined fields dropped
  assert.strictEqual(params[0].sender, '0xabc')
  assert.strictEqual(params[0].callData, '0xdead')
  assert.strictEqual('nonce' in params[0], false)
  assert.strictEqual('call_data' in params[0], false) // never the snake key

  // response mapping camel→snake
  assert.deepStrictEqual(res, {
    paymaster_and_data: '0xfeed',
    pre_verification_gas: '0x1',
    verification_gas_limit: '0x2',
    call_gas_limit: '0x3',
  })
})

test('HTTP non-2xx → 502 PROVIDER_UNAVAILABLE with the status', async () => {
  stubFetch({ ok: false, status: 503, json: async () => ({}) })
  await assert.rejects(
    () => fetchPaymasterHttp(URL).sponsorUserOperation(USER_OP, ENTRY_POINT_V06),
    (e: unknown) => {
      assert.ok(e instanceof AppError)
      assert.strictEqual(e.statusCode, 502)
      assert.strictEqual(e.code, 'PROVIDER_UNAVAILABLE')
      assert.match(e.message, /503/)
      return true
    },
  )
})

test('JSON-RPC error body → 502 carrying the provider message', async () => {
  stubFetch({ json: async () => ({ error: { message: 'over budget' } }) })
  await assert.rejects(
    () => fetchPaymasterHttp(URL).sponsorUserOperation(USER_OP, ENTRY_POINT_V06),
    (e: unknown) => {
      assert.ok(e instanceof AppError)
      assert.strictEqual(e.statusCode, 502)
      assert.match(e.message, /over budget/)
      return true
    },
  )
})

test('missing result (no error, no result) → 502 with the default message', async () => {
  stubFetch({ json: async () => ({ id: 1, jsonrpc: '2.0' }) })
  await assert.rejects(
    () => fetchPaymasterHttp(URL).sponsorUserOperation(USER_OP, ENTRY_POINT_V06),
    (e: unknown) => {
      assert.ok(e instanceof AppError)
      assert.match(e.message, /rejected the sponsorship/)
      return true
    },
  )
})

test('result present but a gas field is non-string → 502 missing-gas-fields', async () => {
  stubFetch({
    json: async () => ({ result: { ...GOOD_RESULT, callGasLimit: 12345 } }),
  })
  await assert.rejects(
    () => fetchPaymasterHttp(URL).sponsorUserOperation(USER_OP, ENTRY_POINT_V06),
    (e: unknown) => {
      assert.ok(e instanceof AppError)
      assert.match(e.message, /missing gas fields/)
      return true
    },
  )
})

// ADVERSARIAL: a spec-loose server returns `error: null` alongside a valid
// result. The strict `!== undefined` check rejected this as a 502; `!= null`
// accepts it. Fails against the pre-hardening code.
test('explicit error:null with a valid result is accepted, not rejected', async () => {
  stubFetch({ json: async () => ({ error: null, result: GOOD_RESULT }) })
  const res = await fetchPaymasterHttp(URL).sponsorUserOperation(USER_OP, ENTRY_POINT_V06)
  assert.strictEqual(res.paymaster_and_data, '0xfeed')
})
