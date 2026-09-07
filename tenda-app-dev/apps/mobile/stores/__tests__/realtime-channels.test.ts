/**
 * The three realtime seams the other suites do not reach: the connection flag,
 * the escrow channel, and the gig-feed channel (#70).
 *
 * All three were inside the coverage gate and uncovered — visible only because
 * #58 put realtime.store.ts in the gate at all. None is dead code: `connected`
 * is what every offline state on every screen reads, the escrow channel is the
 * path #33 wired for verify-tx republishes, and the feed channel is how a new
 * gig reaches a browsing reader.
 *
 * THE FRAME GUARDS ARE THE POINT. A predicate that always answers true passes
 * every happy-path test and hands a malformed frame to `onEvent` as if it were
 * well-formed, so each guard here has a case per field it checks — the negative
 * cases are the ones that would have caught it.
 *
 * ws + api are mocked so importing realtime.store pulls no native transport,
 * matching the two suites beside it.
 */
const mockChannelListeners = new Map<string, (frame: WsFrame) => void>()

/**
 * The connection listeners live INSIDE the factory, unlike the channel map.
 *
 * Not a style choice: `realtime.store` calls `ws.onConnectionChange` at MODULE
 * scope, and babel-jest hoists this file's imports above its `const`
 * declarations — so a captured outer `jest.fn` is still in its temporal dead
 * zone when the store registers, and the import throws
 * "onConnectionChange is not a function". The channel map gets away with being
 * an outer const because `subscribe` only touches it when a case calls it.
 */
jest.mock('@/lib/ws', () => {
  const connectionListeners: Array<(connected: boolean) => void> = []
  return {
    ws: {
      subscribe: (channel: string, listener: (frame: WsFrame) => void) => {
        mockChannelListeners.set(channel, listener)
        return () => mockChannelListeners.delete(channel)
      },
      onConnectionChange: (listener: (connected: boolean) => void) => {
        connectionListeners.push(listener)
      },
    },
    connectionListeners,
  }
})
jest.mock('@/api/client', () => ({
  api: {
    notifications: { feed: jest.fn(), unreadCount: jest.fn() },
    conversations: { list: jest.fn() },
  },
}))

import {
  GIG_FEED_CHANNEL,
  wsChannelName,
  type EscrowEventFrame,
  type GigFeedServerFrame,
} from '@tenda/shared'
import {
  isEscrowEventFrame,
  subscribeEscrowChannel,
  subscribeGigFeedChannel,
  useRealtimeStore,
} from '@/stores/realtime.store'
import { gigDetail } from '@/components/gig/__fixtures__/gig-detail'
// Type-only: jest.mock replaces the runtime module, but this is the frame shape
// the listener really receives, so typing the fixtures against it is what stops
// a case asserting on a frame the transport could never deliver.
import type { WsFrame } from '@/lib/ws'

/**
 * Read back through `requireMock` because the array belongs to the factory
 * above, not to this file. The cast is on the mock boundary, where `@/lib/ws`'s
 * real types do not describe the extra handle the factory adds.
 *
 * Asserted rather than assumed: if the store ever stops registering at import,
 * every connection case below would silently test nothing.
 */
const { connectionListeners } = jest.requireMock('@/lib/ws') as {
  connectionListeners: ReadonlyArray<(connected: boolean) => void>
}
const connectionListener = connectionListeners[0]
if (connectionListener === undefined) {
  throw new Error('realtime.store registered no connection listener at import')
}

const ESCROW_ID = 'e1'
const ESCROW_CHANNEL = wsChannelName('escrow', ESCROW_ID)

/**
 * `event` is a name from the server's own ESCROW_EVENTS vocabulary
 * (apps/server/src/chains/types/events.ts). The guard only checks it is a
 * string, so an invented name would pass — and read as real to the next person.
 * This one is emitted by the fanout worker on a create.
 */
function escrowFrame(): EscrowEventFrame {
  return {
    channel: ESCROW_CHANNEL,
    type: 'escrow_event',
    escrow_id: ESCROW_ID,
    event: 'EscrowCreated',
    tx_ref: 'tx-1',
  }
}

/**
 * A frame the SOCKET can deliver but `WsFrame` cannot express — it is a closed
 * union of WELL-FORMED frames, and the gap between that and what arrives is the
 * whole reason the guards exist.
 *
 * Parsed rather than cast, because parsing is literally what lib/ws does with
 * whatever comes off the wire. A cast would describe the same data while
 * claiming the type system had been consulted.
 */
function wireFrame(json: string): WsFrame {
  return JSON.parse(json)
}

function available(): GigFeedServerFrame {
  const gig = gigDetail({ escrow_id: 'g1' })
  return {
    channel: GIG_FEED_CHANNEL,
    type: 'gig_available',
    event_id: 'ev-1',
    escrow_id: gig.escrow_id,
    gig_revision: '1',
    occurred_at: '2026-08-20T10:00:00.000Z',
    gig,
  }
}

function unavailable(): GigFeedServerFrame {
  return {
    channel: GIG_FEED_CHANNEL,
    type: 'gig_unavailable',
    event_id: 'ev-2',
    escrow_id: 'g1',
    gig_revision: '2',
    occurred_at: '2026-08-20T10:01:00.000Z',
    cause: 'accepted',
  }
}

beforeEach(() => {
  mockChannelListeners.clear()
  useRealtimeStore.setState({ connected: false })
})

describe('the connection flag', () => {
  test('the socket coming up raises it, and going down lowers it again', () => {
    // Both directions in one case because the failure that matters is a flag
    // that latches: raised once and never lowered reads as "online" through
    // every subsequent outage, and the chat fallback polls key off it.
    connectionListener(true)
    expect(useRealtimeStore.getState().connected).toBe(true)

    connectionListener(false)
    expect(useRealtimeStore.getState().connected).toBe(false)
  })
})

describe('isEscrowEventFrame', () => {
  test('accepts a well-formed escrow event', () => {
    expect(isEscrowEventFrame(escrowFrame())).toBe(true)
  })

  test('rejects a frame of another type', () => {
    expect(
      isEscrowEventFrame(wireFrame('{"channel":"escrow:e1","type":"message"}')),
    ).toBe(false)
  })

  test('rejects a non-string escrow_id, event or tx_ref', () => {
    // One assertion per field the guard reads. A guard that checked only `type`
    // would pass the happy path above and every one of these — which is exactly
    // what its mutant does.
    const base = '"channel":"escrow:e1","type":"escrow_event"'
    expect(
      isEscrowEventFrame(wireFrame(`{${base},"escrow_id":42,"event":"EscrowCreated","tx_ref":"t"}`)),
    ).toBe(false)
    expect(
      isEscrowEventFrame(wireFrame(`{${base},"escrow_id":"e1","event":null,"tx_ref":"t"}`)),
    ).toBe(false)
    // tx_ref absent entirely — the shape a truncated or older frame has.
    expect(
      isEscrowEventFrame(wireFrame(`{${base},"escrow_id":"e1","event":"EscrowCreated"}`)),
    ).toBe(false)
  })
})

describe('subscribeEscrowChannel', () => {
  test('forwards a well-formed event on the escrow channel', () => {
    const onEvent = jest.fn<void, [EscrowEventFrame]>()
    subscribeEscrowChannel(ESCROW_ID, onEvent)

    mockChannelListeners.get(ESCROW_CHANNEL)?.(escrowFrame())

    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ tx_ref: 'tx-1' }))
  })

  test('drops a malformed frame rather than handing it on', () => {
    // The consumer is escrow-sync, which reads tx_ref to match a broadcast it
    // is waiting for; a frame without one would be matched against undefined.
    const onEvent = jest.fn<void, [EscrowEventFrame]>()
    subscribeEscrowChannel(ESCROW_ID, onEvent)

    mockChannelListeners.get(ESCROW_CHANNEL)?.(
      wireFrame('{"channel":"escrow:e1","type":"escrow_event","escrow_id":"e1","event":"EscrowCreated","tx_ref":7}'),
    )

    expect(onEvent).not.toHaveBeenCalled()
  })

  test('unsubscribing detaches the listener', () => {
    const unsubscribe = subscribeEscrowChannel(ESCROW_ID, jest.fn())
    expect(mockChannelListeners.has(ESCROW_CHANNEL)).toBe(true)

    unsubscribe()

    expect(mockChannelListeners.has(ESCROW_CHANNEL)).toBe(false)
  })
})

describe('subscribeGigFeedChannel', () => {
  test('forwards both feed events on the shared feed channel', () => {
    const onEvent = jest.fn<void, [GigFeedServerFrame]>()
    subscribeGigFeedChannel(onEvent)

    mockChannelListeners.get(GIG_FEED_CHANNEL)?.(available())
    mockChannelListeners.get(GIG_FEED_CHANNEL)?.(unavailable())

    expect(onEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'gig_available' }))
    expect(onEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: 'gig_unavailable' }))
  })

  test('ignores a frame that is neither', () => {
    // The feed channel carries only these two today, but the guard is what
    // keeps a future frame type from reaching a consumer that cannot read it.
    const onEvent = jest.fn<void, [GigFeedServerFrame]>()
    subscribeGigFeedChannel(onEvent)

    mockChannelListeners.get(GIG_FEED_CHANNEL)?.({
      channel: GIG_FEED_CHANNEL,
      type: 'message',
      message: {
        id: 'm1',
        conversation_id: 'c1',
        sender_id: 'them',
        escrow_id: null,
        escrow_title: null,
        escrow_kind: null,
        content: 'hi',
        read_at: null,
        created_at: '2026-08-20T10:02:00.000Z',
        attachment_url: null,
        attachment_type: null,
        attachment_size: null,
      },
    })

    expect(onEvent).not.toHaveBeenCalled()
  })

  test('unsubscribing detaches the listener', () => {
    const unsubscribe = subscribeGigFeedChannel(jest.fn())
    expect(mockChannelListeners.has(GIG_FEED_CHANNEL)).toBe(true)

    unsubscribe()

    expect(mockChannelListeners.has(GIG_FEED_CHANNEL)).toBe(false)
  })
})
