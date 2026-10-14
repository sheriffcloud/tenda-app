/**
 * The admin client's response types come from `AdminContract`, never from the call
 * site. A hand-typed `api.get<{ ... }>(...)` is how this client came to declare a user
 * phone number the users table has never had, and to take a provider update for a
 * provider row when the route answers `{ provider }`: nothing compared the shape to the
 * server's, so nothing noticed. Every generic argument must therefore be `Res<...>`,
 * the contract's response accessor.
 */
import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(__dirname, '../../api/client.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const CALL = /api\.(get|post|put|patch|delete)<([^(]*)>\(/g

test('the client makes calls at all (a scan that matches nothing would pass anything)', () => {
  expect([...source.matchAll(CALL)].length).toBeGreaterThan(40)
})

test('every response type is the contract\'s `Res<AdminContract[...]>`, never typed at the call site', () => {
  const handTyped = [...source.matchAll(CALL)].filter((match) => !/^Res<Admin\[/.test(match[2].trim())).map((match) => `${match[1]}<${match[2].trim()}>`)
  expect(handTyped).toEqual([])
})

test('the client imports its types from the shared contract', () => {
  expect(source).toMatch(/AdminContract/)
  expect(source).toMatch(/from '@tenda\/shared'/)
})
