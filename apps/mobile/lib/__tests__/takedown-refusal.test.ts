/**
 * `isTakedownRefusal` — the signal that a screen is out of date.
 *
 * What matters here is the NARROWNESS. Every caller responds by re-reading the
 * detail, and a refetch that fires on the wrong failures is its own bug: a 409
 * from an ordinary state-machine conflict, or a lost packet, would blank and
 * reload a screen the user is mid-way through. So the code is the test subject,
 * not the status.
 */
import { ApiClientError } from '@/api/client'
import { isTakedownRefusal } from '../takedown-refusal'

test('the takedown code is a refusal, whatever status carries it', () => {
  expect(isTakedownRefusal(new ApiClientError(409, 'Conflict', 'gone', 'ESCROW_TAKEN_DOWN'))).toBe(
    true,
  )
})

test('a DIFFERENT 409 is not — the status alone must never match', () => {
  // The neighbour it would be easiest to confuse: same status, same route, and
  // re-reading is arguably fine — but it is a different fact about the escrow,
  // and matching on 409 would make this predicate mean "conflict" instead of
  // "taken down".
  expect(
    isTakedownRefusal(new ApiClientError(409, 'Conflict', 'wrong status', 'ESCROW_WRONG_STATUS')),
  ).toBe(false)
})

test.each([
  ['404 not found', new ApiClientError(404, 'Not Found', 'gone', 'NOT_FOUND')],
  ['403 forbidden', new ApiClientError(403, 'Forbidden', 'no', 'FORBIDDEN')],
  ['500 server error', new ApiClientError(500, 'Internal', 'boom', 'INTERNAL_ERROR')],
  ['an envelope with no code at all', new ApiClientError(409, 'Conflict', 'boom')],
])('%s is not a takedown refusal', (_label, thrown) => {
  expect(isTakedownRefusal(thrown)).toBe(false)
})

test.each([
  ['a network failure', new TypeError('Network request failed')],
  ['a plain Error', new Error('boom')],
  ['a string', 'ESCROW_TAKEN_DOWN'],
  ['null', null],
  ['undefined', undefined],
  // The shape that would slip through a duck-typed check. Only a real envelope
  // from the server can prove the listing was pulled.
  ['a bare object wearing the code', { code: 'ESCROW_TAKEN_DOWN', statusCode: 409 }],
])('%s is not a takedown refusal', (_label, thrown) => {
  expect(isTakedownRefusal(thrown)).toBe(false)
})
