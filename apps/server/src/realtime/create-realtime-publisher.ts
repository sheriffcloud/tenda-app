import { randomUUID } from 'node:crypto'
import type { WsServerFrame } from '@tenda/shared'
import type { WsBroadcaster } from '@server/lib/ws'
import { createRecentEventCache } from './recent-event-cache'
import {
  REALTIME_ENVELOPE_SCHEMA_VERSION,
  type RealtimeEnvelope,
} from './realtime-envelope'
import type { RealtimePublisher } from './realtime-publisher.types'
import type { RealtimeRemoteTransport } from './redis-realtime-transport'

export interface RealtimePublisherController {
  publisher: RealtimePublisher
  receiveRemote(envelope: RealtimeEnvelope): void
}

export function createRealtimePublisher(
  instanceId: string,
  broadcaster: WsBroadcaster,
  remote: () => RealtimeRemoteTransport | null,
): RealtimePublisherController {
  const recentEvents = createRecentEventCache()
  function broadcast(frame: WsServerFrame): void {
    const { channel, ...payload } = frame
    broadcaster.broadcast(channel, payload)
  }
  return {
    publisher: {
      publish(frame) {
        const eventId = 'event_id' in frame ? frame.event_id : randomUUID()
        recentEvents.remember(eventId)
        broadcast(frame)
        remote()?.publish({
          schema_version: REALTIME_ENVELOPE_SCHEMA_VERSION,
          event_id: eventId,
          source_instance: instanceId,
          frame,
        })
      },
    },
    receiveRemote(envelope) {
      if (envelope.source_instance === instanceId) return
      if (!recentEvents.remember(envelope.event_id)) return
      broadcast(envelope.frame)
    },
  }
}
