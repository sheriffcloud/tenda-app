/**
 * AdminContract is the dashboard's wire contract; `adminRoutes` is its URL map.
 * They must describe the SAME routes, and nothing at runtime compares a type to
 * a value, so this is checked at COMPILE time: `tsc -p test/tsconfig.json` (the
 * `test` script runs it first) fails if a route is added to one and not the other.
 * The runtime assertions below only keep the file honest about what it proves.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adminRoutes } from '../../src/api/admin-routes'
import type { AdminContract, Wire } from '../../src'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
/** A route key: a string leaf, or a group of them. */
type RouteShape<T> = T extends string ? 'route' : { -readonly [K in keyof T]: RouteShape<T[K]> }
/** A contract key: an Endpoint, a per-method record of them (one URL, several methods), or a group. */
type ContractShape<T> = T extends { method: string }
  ? 'route'
  : [keyof T] extends [Method]
    ? 'route'
    : { [K in keyof T]: ContractShape<T[K]> }
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false

// The assignment IS the assertion: it does not compile unless the two shapes are identical.
const sameRoutes: Equal<RouteShape<typeof adminRoutes>, ContractShape<AdminContract>> = true

/** Each per-method record's keys name the method its Endpoint declares. */
type MethodsAgree<R extends Record<string, { method: string }>> = { [K in keyof R]: R[K]['method'] extends K ? true : false }[keyof R] extends true ? true : false
const resolutionMethods: MethodsAgree<AdminContract['disputes']['resolution']> = true
const threadMethods: MethodsAgree<AdminContract['disputeThread']['messages']> = true
const configMethods: MethodsAgree<AdminContract['platformConfig']> = true

/** `Wire` turns exactly the Date columns into strings, and leaves everything else alone. */
const wireTurnsDatesIntoStrings: Equal<
  Wire<{ a: Date; b: Date | null; c: string; d: number | null }>,
  { a: string; b: string | null; c: string; d: number | null }
> = true

test('AdminContract and adminRoutes describe the same routes (proved by the compiler)', () => {
  assert.equal(sameRoutes, true)
  assert.ok(Object.keys(adminRoutes).length > 10, 'adminRoutes read as an empty map: the parity above would prove nothing')
})

test('a route key serving several methods holds one Endpoint per method, each naming its own', () => {
  assert.deepEqual([resolutionMethods, threadMethods, configMethods], [true, true, true])
})

test('Wire maps Date and Date | null to strings', () => {
  assert.equal(wireTurnsDatesIntoStrings, true)
})
