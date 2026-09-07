/**
 * usersApi — verb, route and payload per method.
 *
 * Two aggregates here are deliberately NOT derived from a page of rows
 * (`transactionsSummary`, `completedWork`); their tests pin that they are their
 * own endpoints, because "just reduce over the list you already have" is the
 * change that would quietly reintroduce the bug each was written to fix.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apiRoutes } from '../../../src/api/routes'
import { createUsersApi } from '../../../src/api/client/users'
import { assertLastCall, expectClientCall, recordingRequest, type ClientCase } from './harness'


const { request, calls } = recordingRequest()
const usersApi = createUsersApi(request)
const { users } = apiRoutes
const id = { id: 'u1' }

const CASES: ClientCase[] = [
  { name: 'me', call: () => usersApi.me(), method: 'GET', path: users.me },
  {
    name: 'updateMe',
    call: () => usersApi.updateMe({ first_name: 'Ada' }),
    method: 'PATCH',
    path: users.updateMe,
    options: { body: { first_name: 'Ada' } },
  },
  { name: 'myStanding', call: () => usersApi.myStanding(), method: 'GET', path: users.myStanding },
  {
    name: 'standing (scoped)',
    call: () => usersApi.standing(id),
    method: 'GET',
    path: users.standing,
    options: { params: id },
  },
  {
    name: 'completedWork (scoped)',
    call: () => usersApi.completedWork(id),
    method: 'GET',
    path: users.completedWork,
    options: { params: id },
  },
  { name: 'get (scoped)', call: () => usersApi.get(id), method: 'GET', path: users.get, options: { params: id } },
  {
    name: 'update (scoped)',
    call: () => usersApi.update(id, { first_name: 'Ada' }),
    method: 'PATCH',
    path: users.update,
    options: { params: id, body: { first_name: 'Ada' } },
  },
  {
    name: 'escrows (query omitted)',
    call: () => usersApi.escrows(id),
    method: 'GET',
    path: users.escrows,
    options: { params: id, query: undefined },
  },
  {
    name: 'reviews (query given)',
    call: () => usersApi.reviews(id, { limit: 1 }),
    method: 'GET',
    path: users.reviews,
    options: { params: id, query: { limit: 1 } },
  },
  {
    name: 'transactions (query given)',
    call: () => usersApi.transactions(id, { limit: 20 }),
    method: 'GET',
    path: users.transactions,
    options: { params: id, query: { limit: 20 } },
  },
  {
    name: 'transactionsSummary — its own aggregate, not a reduce over the feed',
    call: () => usersApi.transactionsSummary(id),
    method: 'GET',
    path: users.transactionsSummary,
    options: { params: id },
  },
]

for (const testCase of CASES) {
  test(testCase.name, async () => {
    await expectClientCall(calls, testCase)
  })
}
