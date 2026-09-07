/**
 * useNotificationDeepLink — the routing matrix for tapped push notifications.
 * Escrow lifecycle pushes were previously dead (no 'escrow' branch existed);
 * these pin that they now route to /gig vs /exchange by kind, and that the
 * legacy/other payloads still resolve. Native modules are stubbed.
 */
const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))

const mockAddListener = jest.fn()
jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: (...a: unknown[]) => mockAddListener(...a),
}))

import { renderHook } from '@testing-library/react-native'
import { resolveNotificationRoute, useNotificationDeepLink } from '@/hooks/useNotificationDeepLink'

describe('resolveNotificationRoute', () => {
  test('escrow push routes by kind', () => {
    expect(resolveNotificationRoute({ screen: 'escrow', escrowId: 'e1', kind: 'exchange' })).toBe('/exchange/e1')
    expect(resolveNotificationRoute({ screen: 'escrow', escrowId: 'e1', kind: 'gig' })).toBe('/gig/e1')
  })

  test('escrow push without kind falls back to /gig (pre-exchange payloads)', () => {
    expect(resolveNotificationRoute({ screen: 'escrow', escrowId: 'e1' })).toBe('/gig/e1')
  })

  test('escrow push missing the id is not routable', () => {
    expect(resolveNotificationRoute({ screen: 'escrow', kind: 'exchange' })).toBeNull()
  })

  test('legacy gig / chat / dispute payloads still resolve', () => {
    expect(resolveNotificationRoute({ screen: 'gig', gigId: 'g1' })).toBe('/gig/g1')
    expect(resolveNotificationRoute({ screen: 'chat', userId: 'u1' })).toBe('/chat/u1')
    expect(resolveNotificationRoute({ screen: 'dispute', escrowId: 'e1' })).toBe('/dispute/e1')
  })

  test('undefined / unknown / incomplete payloads are not routable', () => {
    expect(resolveNotificationRoute(undefined)).toBeNull()
    expect(resolveNotificationRoute({ screen: 'mystery' })).toBeNull()
    expect(resolveNotificationRoute({ screen: 'chat' })).toBeNull()
  })
})

describe('useNotificationDeepLink listener', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockAddListener.mockClear()
    mockAddListener.mockReturnValue({ remove: jest.fn() })
  })

  function fireTap(data: Record<string, string> | undefined) {
    renderHook(() => useNotificationDeepLink())
    const handler = mockAddListener.mock.calls[0][0] as (r: unknown) => void
    handler({ notification: { request: { content: { data } } } })
  }

  test('taps navigate to the resolved route', () => {
    fireTap({ screen: 'escrow', escrowId: 'e9', kind: 'exchange' })
    expect(mockPush).toHaveBeenCalledWith('/exchange/e9')
  })

  test('a non-routable tap navigates nowhere', () => {
    fireTap(undefined)
    expect(mockPush).not.toHaveBeenCalled()
  })
})
