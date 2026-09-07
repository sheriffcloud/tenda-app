import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { WsServerFrame } from '@tenda/shared'
import { createWsBroadcaster, type WsSink } from '@server/lib/ws'
import { createRealtimePublisher } from '@server/realtime'
import type { RealtimeEnvelope } from '@server/realtime'
import type { RealtimeRemoteTransport } from '@server/realtime/redis-realtime-transport'
import { createRecentEventCache } from '@server/realtime/recent-event-cache'

const frame: WsServerFrame = {
  channel: 'escrow:e1',
  type: 'escrow_event',
  escrow_id: 'e1',
  event: 'EscrowAccepted',
  tx_ref: 'tx-1',
}

function sink(): WsSink & { messages: string[] } {
  const messages: string[] = []
  return { messages, send(value) { messages.push(value) } }
}

function transport(envelopes: RealtimeEnvelope[]): RealtimeRemoteTransport {
  return {
    async ready() {},
    publish(envelope) { envelopes.push(envelope) },
    async close() {},
  }
}

test('publishes locally once and forwards one envelope to the remote adapter', () => {
  const broadcaster = createWsBroadcaster()
  const receiver = sink()
  const envelopes: RealtimeEnvelope[] = []
  broadcaster.subscribe(frame.channel, receiver)
  const controller = createRealtimePublisher('instance-a', broadcaster, () => transport(envelopes))
  controller.publisher.publish(frame)
  assert.equal(receiver.messages.length, 1)
  assert.equal(envelopes.length, 1)
  assert.equal(envelopes[0].source_instance, 'instance-a')
})

test('origin echo and duplicate remote envelopes never broadcast twice', () => {
  const broadcaster = createWsBroadcaster()
  const receiver = sink()
  broadcaster.subscribe(frame.channel, receiver)
  const controller = createRealtimePublisher('instance-a', broadcaster, () => null)
  const envelope: RealtimeEnvelope = {
    schema_version: 1,
    event_id: 'event-1',
    source_instance: 'instance-b',
    frame,
  }
  controller.receiveRemote(envelope)
  controller.receiveRemote(envelope)
  controller.receiveRemote({ ...envelope, event_id: 'event-2', source_instance: 'instance-a' })
  assert.equal(receiver.messages.length, 1)
})

test('local delivery survives an absent Redis adapter', () => {
  const broadcaster = createWsBroadcaster()
  const receiver = sink()
  broadcaster.subscribe(frame.channel, receiver)
  createRealtimePublisher('instance-a', broadcaster, () => null).publisher.publish(frame)
  assert.equal(receiver.messages.length, 1)
})

test('recent-event deduplication is bounded and evicts the oldest id', () => {
  const cache = createRecentEventCache(2)
  assert.equal(cache.remember('first'), true)
  assert.equal(cache.remember('second'), true)
  assert.equal(cache.remember('second'), false)
  assert.equal(cache.remember('third'), true)
  assert.equal(cache.remember('first'), true)
})
