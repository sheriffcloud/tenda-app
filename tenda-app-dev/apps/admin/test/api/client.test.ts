import { test, expect, vi, beforeEach } from 'vitest'

// Mock the HTTP core so each thin wrapper's path/verb is observable without
// a network. This file-local mock does not affect other suites.
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(() => Promise.resolve(undefined)),
    post: vi.fn(() => Promise.resolve(undefined)),
    patch: vi.fn(() => Promise.resolve(undefined)),
    put: vi.fn(() => Promise.resolve(undefined)),
    delete: vi.fn(() => Promise.resolve(undefined)),
  },
}))

import { adminApi } from '@/api/client'
import { api } from '@/lib/api'

const get = vi.mocked(api.get)
const post = vi.mocked(api.post)
const patch = vi.mocked(api.patch)
const put = vi.mocked(api.put)
const del = vi.mocked(api.delete)

const lastPath = (fn: { mock: { calls: unknown[][] } }): string => String(fn.mock.calls.at(-1)?.[0])

beforeEach(() => vi.clearAllMocks())

test('withQuery: list with no params yields the bare path; params append a query string', async () => {
  await adminApi.disputes.list()
  expect(lastPath(get)).toBe('/v1/admin/disputes')
  await adminApi.disputes.list({ status: 'open', limit: 20, assigned: 'me' })
  expect(lastPath(get)).toBe('/v1/admin/disputes?status=open&limit=20&assigned=me')
})

test('withQuery drops undefined values', async () => {
  await adminApi.disputeThread.get('e1') // after undefined
  expect(lastPath(get)).toBe('/v1/escrows/e1/dispute/messages')
  await adminApi.disputeThread.get('e1', 'cursor-9')
  expect(lastPath(get)).toBe('/v1/escrows/e1/dispute/messages?after=cursor-9')
})

test('auth + metrics + finance verbs and paths', async () => {
  await adminApi.auth.sendEmailOtp({ email: 'a@b.c' })
  expect(lastPath(post)).toBe('/v1/auth/admin/send-email-otp')
  await adminApi.auth.verifyEmailOtp({ email: 'a@b.c', code: '123456' })
  expect(lastPath(post)).toBe('/v1/auth/admin/verify-email-otp')
  await adminApi.metrics.get()
  expect(lastPath(get)).toBe('/v1/admin/metrics')
  await adminApi.finance.fees({ from: '2026-06-01' })
  expect(lastPath(get)).toBe('/v1/admin/finance/fees?from=2026-06-01')
})

test('disputes: get/claim/release build the :id path', async () => {
  await adminApi.disputes.get('d1')
  expect(lastPath(get)).toBe('/v1/admin/disputes/d1')
  await adminApi.disputes.claim('d1')
  expect(lastPath(post)).toBe('/v1/admin/disputes/d1/claim')
  await adminApi.disputes.release('d1')
  expect(lastPath(post)).toBe('/v1/admin/disputes/d1/release')
})

test('disputeThread.send + reports', async () => {
  await adminApi.disputeThread.send('e1', 'hi')
  expect(lastPath(post)).toBe('/v1/escrows/e1/dispute/messages')
  await adminApi.reports.list({ status: 'pending' })
  expect(lastPath(get)).toBe('/v1/admin/reports?status=pending')
  await adminApi.reports.action('r1', { status: 'reviewed' })
  expect(lastPath(patch)).toBe('/v1/admin/reports/r1')
})

test('escrows + adminUsers across all verbs', async () => {
  await adminApi.escrows.list({ kind: 'gig' })
  expect(lastPath(get)).toBe('/v1/admin/escrows?kind=gig')
  await adminApi.escrows.setHidden('e1', true)
  expect(lastPath(patch)).toBe('/v1/admin/escrows/e1/hidden')
  await adminApi.adminUsers.list({ search: 'ada' })
  expect(lastPath(get)).toBe('/v1/admin/users?search=ada')
  await adminApi.adminUsers.get('u1')
  expect(lastPath(get)).toBe('/v1/admin/users/u1')
  await adminApi.adminUsers.updateStatus('u1', 'suspended')
  expect(lastPath(patch)).toBe('/v1/admin/users/u1/status')
  await adminApi.adminUsers.updateRole('u1', 'dispute_admin')
  expect(lastPath(patch)).toBe('/v1/admin/users/u1/role')
  await adminApi.adminUsers.grantLoginEmail('u1', 'a@b.c')
  expect(lastPath(put)).toBe('/v1/admin/users/u1/login-email')
  await adminApi.adminUsers.revokeLoginEmail('u1')
  expect(lastPath(del)).toBe('/v1/admin/users/u1/login-email')
})

test('featured + platformConfig + announcements', async () => {
  await adminApi.featured.list()
  expect(lastPath(get)).toBe('/v1/admin/featured')
  await adminApi.featured.create({ escrow_id: 'e1', position: 0 } as Parameters<typeof adminApi.featured.create>[0])
  expect(lastPath(post)).toBe('/v1/admin/featured')
  await adminApi.featured.update('f1', {} as Parameters<typeof adminApi.featured.update>[1])
  expect(lastPath(patch)).toBe('/v1/admin/featured/f1')
  await adminApi.featured.remove('f1')
  expect(lastPath(del)).toBe('/v1/admin/featured/f1')
  await adminApi.platformConfig.get()
  expect(lastPath(get)).toBe('/v1/admin/platform-config')
  await adminApi.platformConfig.update({ fee_bps: 250 })
  expect(lastPath(patch)).toBe('/v1/admin/platform-config')
  await adminApi.announcements.list()
  expect(lastPath(get)).toBe('/v1/admin/announcements')
  await adminApi.announcements.create({ title: 't', body: 'b', priority: 0 } as Parameters<typeof adminApi.announcements.create>[0])
  expect(lastPath(post)).toBe('/v1/admin/announcements')
  await adminApi.announcements.update('a1', {} as Parameters<typeof adminApi.announcements.update>[1])
  expect(lastPath(patch)).toBe('/v1/admin/announcements/a1')
  await adminApi.announcements.remove('a1')
  expect(lastPath(del)).toBe('/v1/admin/announcements/a1')
})

test('moderation + fiat + push', async () => {
  await adminApi.moderation.verdicts({ decision: 'block' })
  expect(lastPath(get)).toBe('/v1/admin/moderation/verdicts?decision=block')
  await adminApi.moderation.override('m1', 'wrong')
  expect(lastPath(post)).toBe('/v1/admin/moderation/verdicts/m1/override')
  await adminApi.fiat.intents({ status: 'pending' })
  expect(lastPath(get)).toBe('/v1/admin/fiat/intents?status=pending')
  await adminApi.fiat.providers()
  expect(lastPath(get)).toBe('/v1/admin/fiat/providers')
  await adminApi.fiat.forceSettle('i1', 'manual')
  expect(lastPath(post)).toBe('/v1/admin/fiat/intents/i1/force-settle')
  await adminApi.fiat.refund('i1', 'manual')
  expect(lastPath(post)).toBe('/v1/admin/fiat/intents/i1/refund')
  await adminApi.fiat.updateProvider('p1', { is_enabled: false })
  expect(lastPath(patch)).toBe('/v1/admin/fiat/providers/p1')
  await adminApi.push.broadcast({ title: 't', body: 'b', target: 'all' } as Parameters<typeof adminApi.push.broadcast>[0])
  expect(lastPath(post)).toBe('/v1/admin/push/broadcast')
})
