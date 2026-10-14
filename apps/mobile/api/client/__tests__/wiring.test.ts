/**
 * The one thing this app still owns about its API client: that it composes the
 * SHARED endpoint descriptions over ITS OWN transport.
 *
 * The descriptions themselves — verb, route constant, payload — are proved once
 * in packages/shared (test/api/client). What cannot be proved there is that
 * this client actually reaches `../request`, the module that takes the base URL
 * from shared config and reads the JWT from expo-secure-store. Wire it to the
 * wrong transport and every shared test still passes while the app talks to
 * nothing.
 */
jest.mock('../../request', () => ({ request: jest.fn().mockResolvedValue({}) }))

import { request } from '../../request'
import { api } from '@/api/client'

test('each domain calls THIS app’s request, with the shared route', async () => {
  await api.users.me()
  expect(request).toHaveBeenLastCalledWith('GET', '/v1/users/me')

  await api.gigs.featured()
  expect(request).toHaveBeenLastCalledWith('GET', '/v1/gigs/featured')

  await api.platform.config()
  expect(request).toHaveBeenLastCalledWith('GET', '/v1/platform/config')
})

test('the whole client surface is present', () => {
  for (const domain of [
    'auth', 'escrows', 'gigs', 'applications', 'disputes', 'exchange', 'users',
    'upload', 'moderation', 'fiat', 'blockchain', 'platform', 'conversations',
    'notifications', 'subscriptions', 'reports',
  ] as const) {
    expect(typeof api[domain]).toBe('object')
  }
})
