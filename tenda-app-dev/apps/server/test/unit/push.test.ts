/**
 * #98 gap-fill — lib/push (Expo Push API) via a mocked global fetch.
 * Offline unit test: token filtering, batching, ticket handling
 * (DeviceNotRegistered pruning), and both failure branches.
 */
import { test, afterEach } from 'node:test'
import assert from 'node:assert'
import { sendPush } from '@server/lib/push'

type FetchArgs = Parameters<typeof fetch>
interface LoggerCall { obj: object; msg: string }

function fakeLogger() {
  const errors: LoggerCall[] = []
  const warns: LoggerCall[] = []
  return {
    error: (obj: object, msg: string) => { errors.push({ obj, msg }) },
    warn: (obj: object, msg: string) => { warns.push({ obj, msg }) },
    errors,
    warns,
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response
}

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

const TOKEN = (n: number) => `ExponentPushToken[token-${n}]`

test('sendPush: empty token list short-circuits without a network call', async () => {
  let called = false
  globalThis.fetch = (() => { called = true; return Promise.resolve(jsonResponse(200, { data: [] })) }) as typeof fetch
  const out = await sendPush([], { title: 't', body: 'b' }, fakeLogger())
  assert.deepStrictEqual(out, [])
  assert.strictEqual(called, false)
})

test('sendPush: filters out non-Expo tokens entirely', async () => {
  let called = false
  globalThis.fetch = (() => { called = true; return Promise.resolve(jsonResponse(200, { data: [] })) }) as typeof fetch
  const out = await sendPush(['fcm-raw-token', 'apns:abc'], { title: 't', body: 'b' }, fakeLogger())
  assert.deepStrictEqual(out, [])
  assert.strictEqual(called, false)
})

test('sendPush: all-ok tickets return no invalid tokens', async () => {
  globalThis.fetch = (() =>
    Promise.resolve(jsonResponse(200, { data: [{ status: 'ok', id: 'x' }] }))) as typeof fetch
  const out = await sendPush([TOKEN(1)], { title: 't', body: 'b' }, fakeLogger())
  assert.deepStrictEqual(out, [])
})

test('sendPush: a DeviceNotRegistered ticket surfaces its token for pruning', async () => {
  globalThis.fetch = (() =>
    Promise.resolve(jsonResponse(200, {
      data: [
        { status: 'ok' },
        { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      ],
    }))) as typeof fetch
  const log = fakeLogger()
  const out = await sendPush([TOKEN(1), TOKEN(2)], { title: 't', body: 'b' }, log)
  assert.deepStrictEqual(out, [TOKEN(2)])
  assert.strictEqual(log.warns.length, 1)
})

test('sendPush: a non-DeviceNotRegistered error is logged but not pruned', async () => {
  globalThis.fetch = (() =>
    Promise.resolve(jsonResponse(200, {
      data: [{ status: 'error', message: 'MessageTooBig', details: { error: 'MessageTooBig' } }],
    }))) as typeof fetch
  const out = await sendPush([TOKEN(1)], { title: 't', body: 'b' }, fakeLogger())
  assert.deepStrictEqual(out, [])
})

test('sendPush: a non-OK HTTP response is logged and skipped', async () => {
  globalThis.fetch = (() => Promise.resolve(jsonResponse(502, 'bad gateway'))) as typeof fetch
  const log = fakeLogger()
  const out = await sendPush([TOKEN(1)], { title: 't', body: 'b' }, log)
  assert.deepStrictEqual(out, [])
  assert.strictEqual(log.errors.length, 1)
})

test('sendPush: a thrown fetch is caught and logged per batch', async () => {
  globalThis.fetch = (() => Promise.reject(new Error('network down'))) as typeof fetch
  const log = fakeLogger()
  const out = await sendPush([TOKEN(1)], { title: 't', body: 'b' }, log)
  assert.deepStrictEqual(out, [])
  assert.strictEqual(log.errors.length, 1)
})

test('sendPush: more than 100 tokens are split into batches of 100', async () => {
  const batchSizes: number[] = []
  globalThis.fetch = ((_url: FetchArgs[0], init: FetchArgs[1]) => {
    const parsed = JSON.parse(String(init?.body)) as { to: string[] }
    batchSizes.push(parsed.to.length)
    return Promise.resolve(jsonResponse(200, { data: parsed.to.map(() => ({ status: 'ok' })) }))
  }) as typeof fetch
  const tokens = Array.from({ length: 150 }, (_, i) => TOKEN(i))
  await sendPush(tokens, { title: 't', body: 'b' }, fakeLogger())
  assert.deepStrictEqual(batchSizes, [100, 50])
})
