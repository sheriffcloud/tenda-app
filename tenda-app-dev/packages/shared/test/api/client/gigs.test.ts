/**
 * gigsApi / applicationsApi — verb, route and payload per method.
 *
 * Two behaviours here are not table-shaped and get their own tests: `create`
 * carries the moderation timeout (it waits on a content check, not just a
 * write), and `apply` defaults its body to `{}` so an application with no
 * message still sends a body rather than `undefined`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apiRoutes } from '../../../src/api/routes'
import { createGigsApi, createApplicationsApi } from '../../../src/api/client/gigs'
import { MODERATION_TIMEOUT_MS } from '../../../src/api/client/timeouts'
import { assertLastCall, expectClientCall, recordingRequest, type ClientCase } from './harness'


const { request, calls } = recordingRequest()
const gigsApi = createGigsApi(request)
const applicationsApi = createApplicationsApi(request)
const { gigs, applications } = apiRoutes
const id = { id: 'gig-1' }

const CASES: ClientCase[] = [
  { name: 'featured', call: () => gigsApi.featured(), method: 'GET', path: gigs.featured },
  {
    name: 'list (query omitted)',
    call: () => gigsApi.list(),
    method: 'GET',
    path: gigs.list,
    options: { query: undefined },
  },
  {
    name: 'list (query given)',
    call: () => gigsApi.list({ mine: 'working', status: ['completed'], limit: 1 }),
    method: 'GET',
    path: gigs.list,
    options: { query: { mine: 'working', status: ['completed'], limit: 1 } },
  },
  {
    name: 'facets (query given)',
    call: () => gigsApi.facets({ category: 'delivery' }),
    method: 'GET',
    path: gigs.facets,
    options: { query: { category: 'delivery' } },
  },
  { name: 'get (scoped)', call: () => gigsApi.get(id), method: 'GET', path: gigs.get, options: { params: id } },
  {
    name: 'applicants (scoped, query omitted)',
    call: () => gigsApi.applicants(id),
    method: 'GET',
    path: gigs.applicants,
    options: { params: id, query: undefined },
  },
  {
    name: 'applicants (scoped, query given)',
    call: () => gigsApi.applicants(id, { status: ['open'] }),
    method: 'GET',
    path: gigs.applicants,
    options: { params: id, query: { status: ['open'] } },
  },
  {
    name: 'withdrawApplication (scoped)',
    call: () => gigsApi.withdrawApplication(id),
    method: 'DELETE',
    path: gigs.withdrawApplication,
    options: { params: id },
  },
  {
    name: 'applications.mine (query given)',
    call: () => applicationsApi.mine({ limit: 20 }),
    method: 'GET',
    path: applications.mine,
    options: { query: { limit: 20 } },
  },
]

for (const testCase of CASES) {
  test(testCase.name, async () => {
    await expectClientCall(calls, testCase)
  })
}

test('create waits on the MODERATION budget, not the default request timeout', async () => {
  // Publishing runs the Stage-6 content gate server-side; the default timeout
  // would abort a request that was going to succeed.
  const body = { escrow_id: 'e1', title: 'Deliver a parcel', category: 'delivery' as const, country: 'NG', city: 'Lagos' }
  await gigsApi.create(body)
  assertLastCall(calls, 'POST', gigs.create, {
    body,
    timeout: MODERATION_TIMEOUT_MS,
  })
})

test('apply sends an EMPTY body when there is no message, never undefined', async () => {
  await gigsApi.apply(id)
  assertLastCall(calls, 'POST', gigs.apply, { params: id, body: {} })

  await gigsApi.apply(id, { message: 'I can do this' })
  assertLastCall(calls, 'POST', gigs.apply, {
    params: id,
    body: { message: 'I can do this' },
  })
})
