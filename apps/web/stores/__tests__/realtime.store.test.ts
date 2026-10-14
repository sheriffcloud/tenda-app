/**
 * The WS→Zustand bridge and the two S5.1 channel subscriptions. The ws
 * client is mocked at its seam. Frames come typed as WsServerFrame because
 * the wire boundary (parseWsServerFrame, exercised in lib/__tests__/ws and
 * shared) already rejects malformed JSON — what's tested here is the
 * store's connected mirror and the per-channel type FILTERS: a frame of
 * the wrong type on the right channel must never reach a consumer.
 */
import { beforeEach, expect, test, vi } from 'vitest'
import { GIG_FEED_CHANNEL, type GigUnavailableFrame } from '@tenda/shared'
import type { WsFrame } from '@/lib/ws'

// vi.hoisted: the mock factory runs at the store's (hoisted) import, before
// this module's own bindings initialize — plain module-level state would TDZ.
const { channelListeners, connection } = vi.hoisted(() => ({
  channelListeners: new Map<string, (frame: unknown) => void>(),
  connection: { listener: null as ((connected: boolean) => void) | null },
}))

vi.mock('@/lib/ws', () => ({
  ws: {
    subscribe: vi.fn((channel: string, listener: (frame: unknown) => void) => {
      channelListeners.set(channel, listener)
      return () => channelListeners.delete(channel)
    }),
    onConnectionChange: vi.fn((listener: (connected: boolean) => void) => {
      connection.listener = listener
      return () => { connection.listener = null }
    }),
  },
}))

import {
  useRealtimeStore,
  isEscrowEventFrame,
  subscribeEscrowChannel,
  subscribeGigFeedChannel,
} from '@/stores/realtime.store'

const escrowFrame: WsFrame = {
  channel: 'escrow:e1',
  type: 'escrow_event',
  escrow_id: 'e1',
  event: 'EscrowAccepted',
  tx_ref: 'tx-1',
}

const unavailableFrame: GigUnavailableFrame = {
  channel: GIG_FEED_CHANNEL,
  type: 'gig_unavailable',
  event_id: 'ev-1',
  escrow_id: 'e1',
  gig_revision: '2',
  occurred_at: '2026-08-16T10:00:00.000Z',
  cause: 'accepted',
}

beforeEach(() => {
  channelListeners.clear()
  useRealtimeStore.setState({ connected: false })
})

test('mirrors ws connection transitions into the store', () => {
  expect(useRealtimeStore.getState().connected).toBe(false)
  connection.listener?.(true)
  expect(useRealtimeStore.getState().connected).toBe(true)
  connection.listener?.(false)
  expect(useRealtimeStore.getState().connected).toBe(false)
})

test('isEscrowEventFrame accepts the escrow wire shape and rejects other frame types', () => {
  expect(isEscrowEventFrame(escrowFrame)).toBe(true)
  expect(isEscrowEventFrame(unavailableFrame)).toBe(false)
})

test('subscribeEscrowChannel delivers escrow frames and drops other types on the channel', () => {
  const onEvent = vi.fn()
  const unsubscribe = subscribeEscrowChannel('e1', onEvent)
  const listener = channelListeners.get('escrow:e1')
  expect(listener).toBeDefined()

  listener?.(escrowFrame)
  expect(onEvent).toHaveBeenCalledTimes(1)
  expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ tx_ref: 'tx-1' }))

  // Wrong frame type on the right channel: filtered, never forwarded.
  listener?.(unavailableFrame)
  expect(onEvent).toHaveBeenCalledTimes(1)

  unsubscribe()
  expect(channelListeners.has('escrow:e1')).toBe(false)
})

test('subscribeGigFeedChannel passes availability frames and drops the rest', () => {
  const onEvent = vi.fn()
  const unsubscribe = subscribeGigFeedChannel(onEvent)
  const listener = channelListeners.get(GIG_FEED_CHANNEL)
  expect(listener).toBeDefined()

  listener?.(unavailableFrame)
  expect(onEvent).toHaveBeenCalledTimes(1)
  expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ cause: 'accepted' }))

  // An escrow frame that somehow arrives on the feed channel is dropped.
  // (The gig_available pass-branch is exercised by S5.4's feed consumer
  // tests, which own the full GigSummary fixture.)
  listener?.(escrowFrame)
  expect(onEvent).toHaveBeenCalledTimes(1)

  unsubscribe()
  expect(channelListeners.has(GIG_FEED_CHANNEL)).toBe(false)
})
