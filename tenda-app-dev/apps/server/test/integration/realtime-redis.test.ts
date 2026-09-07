import { test } from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import Redis from 'ioredis'
import {
  createRedisRealtimeTransport,
  REALTIME_MAX_MESSAGE_BYTES,
} from '@server/realtime'
import type { RealtimeEnvelope } from '@server/realtime'
import { REALTIME_REDIS_TOPIC } from '@server/realtime/redis-realtime-transport'

const redisUrl = process.env.REDIS_URL
const realtimeRedisTest = redisUrl === undefined ? test.skip : test

realtimeRedisTest('two realtime transports exchange a validated envelope through Redis', async () => {
  const firstApp = Fastify({ logger: false })
  const secondApp = Fastify({ logger: false })
  let resolveReceived: ((envelope: RealtimeEnvelope) => void) | undefined
  const received = new Promise<RealtimeEnvelope>((resolve) => { resolveReceived = resolve })
  const first = createRedisRealtimeTransport(redisUrl ?? '', firstApp.log, () => {})
  const second = createRedisRealtimeTransport(redisUrl ?? '', secondApp.log, (envelope) => {
    resolveReceived?.(envelope)
  })
  const envelope: RealtimeEnvelope = {
    schema_version: 1,
    event_id: 'redis-e2e-event',
    source_instance: 'instance-a',
    frame: {
      channel: 'escrow:e1',
      type: 'escrow_event',
      escrow_id: 'e1',
      event: 'EscrowAccepted',
      tx_ref: 'tx-1',
    },
  }
  await Promise.all([first.ready(), second.ready()])
  first.publish(envelope)
  assert.deepEqual(await received, envelope)
  await Promise.all([first.close(), second.close(), firstApp.close(), secondApp.close()])
})

realtimeRedisTest('malformed, invalid, and oversized Redis messages are rejected before delivery', async () => {
  const app = Fastify({ logger: false })
  const rawPublisher = new Redis(redisUrl ?? '')
  const received: RealtimeEnvelope[] = []
  let resolveValid: (() => void) | undefined
  const validReceived = new Promise<void>((resolve) => { resolveValid = resolve })
  const receiver = createRedisRealtimeTransport(redisUrl ?? '', app.log, (envelope) => {
    received.push(envelope)
    resolveValid?.()
  })
  const valid: RealtimeEnvelope = {
    schema_version: 1,
    event_id: 'valid-after-invalid',
    source_instance: 'instance-a',
    frame: {
      channel: 'escrow:e1', type: 'escrow_event', escrow_id: 'e1',
      event: 'EscrowAccepted', tx_ref: 'tx-1',
    },
  }

  await receiver.ready()
  await rawPublisher.publish(REALTIME_REDIS_TOPIC, '{malformed')
  await rawPublisher.publish(REALTIME_REDIS_TOPIC, JSON.stringify({ schema_version: 1 }))
  await rawPublisher.publish(REALTIME_REDIS_TOPIC, 'x'.repeat(REALTIME_MAX_MESSAGE_BYTES + 1))
  await rawPublisher.publish(REALTIME_REDIS_TOPIC, JSON.stringify(valid))
  await validReceived

  assert.deepEqual(received, [valid])
  await Promise.all([receiver.close(), rawPublisher.quit(), app.close()])
})

realtimeRedisTest('oversized outbound envelopes preserve local behavior without remote delivery', async () => {
  const app = Fastify({ logger: false })
  const received: RealtimeEnvelope[] = []
  const sender = createRedisRealtimeTransport(redisUrl ?? '', app.log, () => {})
  const oversized: RealtimeEnvelope = {
    schema_version: 1,
    event_id: 'oversized',
    source_instance: 'instance-a',
    frame: {
      channel: 'escrow:e1', type: 'escrow_event', escrow_id: 'e1',
      event: 'x'.repeat(REALTIME_MAX_MESSAGE_BYTES), tx_ref: 'tx-1',
    },
  }
  const sentinel: RealtimeEnvelope = {
    schema_version: 1,
    event_id: 'sentinel',
    source_instance: 'instance-a',
    frame: {
      channel: 'escrow:e1', type: 'escrow_event', escrow_id: 'e1',
      event: 'EscrowAccepted', tx_ref: 'tx-1',
    },
  }
  let resolveSentinel: (() => void) | undefined
  const sentinelReceived = new Promise<void>((resolve) => { resolveSentinel = resolve })
  const observingReceiver = createRedisRealtimeTransport(redisUrl ?? '', app.log, (value) => {
    received.push(value)
    if (value.event_id === sentinel.event_id) resolveSentinel?.()
  })

  await Promise.all([sender.ready(), observingReceiver.ready()])
  sender.publish(oversized)
  sender.publish(sentinel)
  await sentinelReceived
  assert.deepEqual(received, [sentinel])
  await Promise.all([sender.close(), observingReceiver.close(), app.close()])
})
