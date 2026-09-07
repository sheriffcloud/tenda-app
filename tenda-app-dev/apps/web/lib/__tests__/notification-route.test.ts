/**
 * Web's routing table over the shared screen vocabulary. The nulls are as
 * load-bearing as the routes: every supported payload must resolve to the
 * matching web surface, while malformed and unknown payloads stay inert.
 */
import { expect, test } from 'vitest'
import { notificationRoute } from '@/lib/notification-route'

test('escrow notices route to the WORKSPACE detail, never the public shell', () => {
  // /my-gigs, not /gig: the reader is signed in by definition, and the
  // my-gigs pane branches on relationship (#49) so one URL fits every
  // recipient — party, applicant, or new-gig subscriber.
  expect(notificationRoute({ screen: 'escrow', escrowId: 'e1', kind: 'gig' })).toBe('/my-gigs/e1')
  expect(notificationRoute({ screen: 'escrow', escrowId: 'e1' })).toBe('/my-gigs/e1') // legacy no-kind
  expect(notificationRoute({ screen: 'escrow', escrowId: 'e1', kind: 'exchange' })).toBe('/exchange/e1')
})

test('chat notices route to the thread', () => {
  expect(notificationRoute({ screen: 'chat', userId: 'u1' })).toBe('/chat/u1')
})

test('dispute and fiat-intent notices route using their canonical producer fields', () => {
  expect(notificationRoute({ screen: 'dispute', escrowId: 'e1' })).toBe('/dispute/e1')
  expect(notificationRoute({ screen: 'fiat-intent', intentId: 'i1' })).toBe('/wallet/intents/i1')
})

test('null data, unknown screens, and missing ids never produce a route', () => {
  expect(notificationRoute(null)).toBeNull()
  expect(notificationRoute({ screen: 'escrow' })).toBeNull() // no escrowId
  expect(notificationRoute({ screen: 'chat' })).toBeNull() // no userId
  expect(notificationRoute({ screen: 'dispute' })).toBeNull()
  expect(notificationRoute({ screen: 'fiat-intent' })).toBeNull()
  expect(notificationRoute({ screen: 'mystery', escrowId: 'e1' })).toBeNull()
})
