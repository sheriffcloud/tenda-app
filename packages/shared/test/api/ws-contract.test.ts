import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GIG_FEED_CHANNEL,
  WS_PATH,
  WS_AUTH_SUBPROTOCOL,
  wsChannelName,
} from '../../src/api/contracts/ws.contract'

test('WS constants are the canonical handshake values', () => {
  assert.equal(WS_PATH, '/v1/ws')
  assert.equal(WS_AUTH_SUBPROTOCOL, 'tenda.v1.auth')
})

test('wsChannelName: composes <kind>:<id> for each channel kind', () => {
  assert.equal(wsChannelName('escrow', 'esc-1'), 'escrow:esc-1')
  assert.equal(wsChannelName('chat', 'conv-9'), 'chat:conv-9')
  assert.equal(wsChannelName('user', 'u-42'), 'user:u-42')
  assert.equal(wsChannelName('feed', 'gigs'), GIG_FEED_CHANNEL)
})
