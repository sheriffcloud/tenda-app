import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseRealtimeEnvelope,
  REALTIME_MAX_MESSAGE_BYTES,
  serializeRealtimeEnvelope,
  type RealtimeEnvelope,
} from '@server/realtime'

const valid: RealtimeEnvelope = {
  schema_version: 1,
  event_id: 'event-1',
  source_instance: 'instance-a',
  frame: {
    channel: 'escrow:e1',
    type: 'escrow_event',
    escrow_id: 'e1',
    event: 'EscrowAccepted',
    tx_ref: 'tx-1',
  },
}

test('parses a valid internal envelope', () => {
  assert.deepEqual(parseRealtimeEnvelope(valid), valid)
})

test('rejects malformed, unsupported and untyped envelopes', () => {
  assert.equal(parseRealtimeEnvelope(null), null)
  assert.equal(parseRealtimeEnvelope({ ...valid, schema_version: 2 }), null)
  assert.equal(parseRealtimeEnvelope({ ...valid, event_id: '' }), null)
  assert.equal(parseRealtimeEnvelope({ ...valid, event_id: 7 }), null)
  assert.equal(parseRealtimeEnvelope({ ...valid, source_instance: '' }), null)
  assert.equal(parseRealtimeEnvelope({ ...valid, source_instance: 7 }), null)
  assert.equal(parseRealtimeEnvelope({ ...valid, frame: { channel: 'user:u1' } }), null)
})

test('serialization rejects oversized UTF-8 payloads before cross-replica publish', () => {
  assert.equal(serializeRealtimeEnvelope(valid), JSON.stringify(valid))
  const oversized: RealtimeEnvelope = {
    ...valid,
    frame: {
      channel: 'escrow:e1',
      type: 'escrow_event',
      escrow_id: 'e1',
      event: '🧪'.repeat(REALTIME_MAX_MESSAGE_BYTES / 2),
      tx_ref: 'tx-1',
    },
  }
  assert.equal(serializeRealtimeEnvelope(oversized), null)
})

test('a feed frame cannot disagree with its deduplication envelope id', () => {
  const feedEnvelope = {
    ...valid,
    event_id: 'outer-event',
    frame: {
      channel: 'feed:gigs', type: 'gig_unavailable', event_id: 'inner-event',
      escrow_id: 'gig-1', gig_revision: '1', occurred_at: '2026-08-13T10:00:00.000Z',
      cause: 'accepted',
    },
  }
  assert.equal(parseRealtimeEnvelope(feedEnvelope), null)
})
