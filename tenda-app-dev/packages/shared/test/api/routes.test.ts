import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apiRoutes } from '../../src/api/routes'

test('apiRoutes: every endpoint is a non-empty /v1-prefixed path', () => {
  for (const [group, endpoints] of Object.entries(apiRoutes)) {
    for (const [name, path] of Object.entries(endpoints)) {
      assert.equal(typeof path, 'string', `${group}.${name} is a string`)
      assert.match(path, /^\/v1\//, `${group}.${name} = "${path}" is /v1-prefixed`)
    }
  }
})

test('apiRoutes: parameterised paths use the :id placeholder convention', () => {
  assert.equal(apiRoutes.escrows.accept, '/v1/escrows/:id/accept')
  assert.equal(apiRoutes.users.get, '/v1/users/:id')
  assert.equal(apiRoutes.gigs.list, '/v1/gigs')
})

test('apiRoutes: GET/POST pairs that intentionally share a path do so deliberately', () => {
  // dispute messages: GET list + POST send share one path (verb disambiguates).
  assert.equal(apiRoutes.escrows.disputeMessages, apiRoutes.escrows.sendDisputeMessage)
  // conversations messages: same pattern.
  assert.equal(apiRoutes.conversations.messages, apiRoutes.conversations.sendMessage)
})
