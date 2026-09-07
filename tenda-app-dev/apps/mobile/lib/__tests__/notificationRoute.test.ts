/**
 * Notification deep-link + icon mapping (Stage 5). Pure data→route/icon
 * resolution; covers each known screen plus the non-navigable fallbacks.
 */
import { Bell, Handshake, ArrowLeftRight, Scale } from 'lucide-react-native'
import { notificationRoute, notificationIcon } from '@/lib/notificationRoute'

describe('notificationRoute', () => {
  test('gig escrow → /gig/:id', () => {
    expect(notificationRoute({ screen: 'escrow', escrowId: 'e1', kind: 'gig' })).toBe('/gig/e1')
  })
  test('exchange escrow → /exchange/:id', () => {
    expect(notificationRoute({ screen: 'escrow', escrowId: 'e2', kind: 'exchange' })).toBe('/exchange/e2')
  })
  test('escrow with no kind defaults to the gig route', () => {
    expect(notificationRoute({ screen: 'escrow', escrowId: 'e3' })).toBe('/gig/e3')
  })
  test('dispute → /dispute/:id', () => {
    expect(notificationRoute({ screen: 'dispute', escrowId: 'e4' })).toBe('/dispute/e4')
  })
  test('null data is not navigable', () => {
    expect(notificationRoute(null)).toBeNull()
  })
  test('an unknown screen is not navigable', () => {
    expect(notificationRoute({ screen: 'mystery' })).toBeNull()
  })
  test('a known screen missing its escrowId is not navigable', () => {
    expect(notificationRoute({ screen: 'escrow' })).toBeNull()
  })
})

describe('notificationIcon', () => {
  test('maps each screen/kind to its glyph, Bell as the fallback', () => {
    expect(notificationIcon({ screen: 'escrow', escrowId: 'e', kind: 'gig' })).toBe(Handshake)
    expect(notificationIcon({ screen: 'escrow', escrowId: 'e', kind: 'exchange' })).toBe(ArrowLeftRight)
    expect(notificationIcon({ screen: 'dispute', escrowId: 'e' })).toBe(Scale)
    expect(notificationIcon(null)).toBe(Bell)
    expect(notificationIcon({ screen: 'other' })).toBe(Bell)
  })
})
