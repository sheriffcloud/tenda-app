import { test, expect } from 'vitest'
import { adminRoutes, buildPath } from '@/api/routes'

test('buildPath substitutes a single :param', () => {
  expect(buildPath(adminRoutes.users.get, { id: 'u1' })).toBe('/v1/admin/users/u1')
})

test('buildPath URL-encodes the value', () => {
  expect(buildPath('/v1/x/:id', { id: 'a/b c' })).toBe('/v1/x/a%2Fb%20c')
})

test('buildPath leaves param-free templates untouched', () => {
  expect(buildPath(adminRoutes.users.list, {})).toBe('/v1/admin/users')
})

test('buildPath throws on a missing param', () => {
  expect(() => buildPath(adminRoutes.users.get, {})).toThrow(/missing path param 'id'/)
})

test('adminRoutes are all /v1-prefixed strings', () => {
  const walk = (o: Record<string, unknown>): void => {
    for (const v of Object.values(o)) {
      if (typeof v === 'string') expect(v).toMatch(/^\/v1\//)
      else if (v && typeof v === 'object') walk(v as Record<string, unknown>)
    }
  }
  walk(adminRoutes)
})
