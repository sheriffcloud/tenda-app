import { test, expect, beforeEach, afterEach, vi } from 'vitest'
import { api, ApiError } from '@/lib/api'
import { setSession } from '@/lib/auth'

const BASE = 'http://localhost:3000'

interface FakeResponse {
  status: number
  ok: boolean
  json: () => Promise<unknown>
}

function respond(status: number, body: unknown, opts: { jsonThrows?: boolean } = {}): FakeResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: opts.jsonThrows ? () => Promise.reject(new Error('not json')) : () => Promise.resolve(body),
  }
}

// The shape lib/api.ts passes as the second fetch arg — typed so the mock's
// recorded calls destructure cleanly (no any/unknown).
interface CapturedInit {
  method: string
  headers: Record<string, string>
  body?: string
}

function mockFetch(res: FakeResponse) {
  const fn = vi.fn<(url: string, init: CapturedInit) => Promise<FakeResponse>>(() => Promise.resolve(res))
  vi.stubGlobal('fetch', fn)
  return fn
}

const realLocation = window.location

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'location', { value: realLocation, writable: true, configurable: true })
})

test('GET success returns parsed JSON and sends no Authorization header when logged out', async () => {
  const fetchFn = mockFetch(respond(200, { ok: true }))
  const result = await api.get<{ ok: boolean }>('/v1/gigs')
  expect(result).toEqual({ ok: true })
  const [url, init] = fetchFn.mock.calls[0]!
  expect(url).toBe(`${BASE}/v1/gigs`)
  expect(init.method).toBe('GET')
  // No body → no JSON content-type (sending it on an empty body trips
  // Fastify: "Body cannot be empty when content-type is set to ...").
  expect(init.headers['Content-Type']).toBeUndefined()
  expect(init.headers['Authorization']).toBeUndefined()
})

test('bodyless POST omits the JSON content-type and sends no body', async () => {
  const fetchFn = mockFetch(respond(200, { id: 'd1', assigned_to_id: 'u1' }))
  await api.post('/v1/admin/disputes/d1/claim')
  const init = fetchFn.mock.calls[0]![1]
  expect(init.method).toBe('POST')
  expect(init.headers['Content-Type']).toBeUndefined()
  expect(init.body).toBeUndefined()
})

test('attaches a Bearer token when a session exists', async () => {
  setSession('jwt-xyz', { id: 'u1', role: 'super_admin', first_name: 'A', last_name: 'B' })
  const fetchFn = mockFetch(respond(200, {}))
  await api.get('/v1/users/me')
  expect(fetchFn.mock.calls[0]![1].headers['Authorization']).toBe('Bearer jwt-xyz')
})

test('POST serialises the body and sets the method', async () => {
  const fetchFn = mockFetch(respond(200, { id: 'x' }))
  await api.post('/v1/reports', { reason: 'spam' })
  const init = fetchFn.mock.calls[0]![1]
  expect(init.method).toBe('POST')
  expect(init.body).toBe(JSON.stringify({ reason: 'spam' }))
})

test('204 No Content resolves to undefined', async () => {
  mockFetch(respond(204, null))
  const result = await api.delete('/v1/escrows/e1')
  expect(result).toBeUndefined()
})

test('non-ok with a JSON error body throws ApiError carrying status/code/message', async () => {
  mockFetch(respond(400, { code: 'VALIDATION_ERROR', message: 'bad input' }))
  await expect(api.get('/v1/gigs')).rejects.toMatchObject({
    name: 'ApiError',
    status: 400,
    code: 'VALIDATION_ERROR',
    message: 'bad input',
  })
})

test('non-ok with a non-JSON body falls back to API_ERROR + generic message', async () => {
  mockFetch(respond(500, null, { jsonThrows: true }))
  const err = await api.get('/v1/gigs').catch((e: unknown) => e)
  expect(err).toBeInstanceOf(ApiError)
  expect((err as ApiError).code).toBe('API_ERROR')
  expect((err as ApiError).message).toBe('Request failed: 500')
})

test('a transport failure identifies the unreachable API instead of looking like an OTP failure', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
  await expect(api.post('/v1/auth/admin/send-email-otp', { email: 'admin@tenda.app' })).rejects.toMatchObject({
    status: 0,
    code: 'NETWORK_ERROR',
    message: `Cannot reach the Tenda API at ${BASE}. Check that the server is running.`,
  })
})

test('401 on a non-auth route clears the session and bounces to /login', async () => {
  setSession('jwt-old', { id: 'u1', role: 'super_admin', first_name: 'A', last_name: 'B' })
  mockFetch(respond(401, {}))
  await expect(api.get('/v1/users/me')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
  expect(window.location.href).toBe('/login')
  expect(localStorage.getItem('tenda_admin_token')).toBeNull() // session cleared
})

test('401 on an auth route does NOT bounce — surfaces the error inline', async () => {
  mockFetch(respond(401, { code: 'OTP_INVALID', message: 'wrong code' }))
  await expect(api.post('/v1/auth/verify-email-otp', {})).rejects.toMatchObject({
    status: 401,
    code: 'OTP_INVALID',
  })
  expect(window.location.href).toBe('') // no redirect
})
