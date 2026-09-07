import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseWsServerFrame } from '../../src/api/contracts/parse-ws-server-frame'

const gig = {
  escrow_id: 'gig-1',
  public_feed_revision: '2',
  chain_id: 'solana:devnet',
  asset: 'USDC_SOL',
  amount_raw: '1000000',
  status: 'open',
  accept_deadline: null,
  created_at: '2026-08-13T10:00:00.000Z',
  title: 'Deliver package',
  description: null,
  category: 'delivery',
  country: 'NG',
  city: 'Lagos',
  latitude: null,
  longitude: null,
  remote: false,
  cross_border: false,
  proof_requirements: [],
  requires_approval: false,
  creator: {
    id: 'user-1', first_name: 'Ada', last_name: 'Lovelace', avatar_url: null,
    review_score: null, is_seeker: false, country: 'NG',
  },
}

const available = {
  channel: 'feed:gigs',
  type: 'gig_available',
  event_id: 'event-1',
  escrow_id: 'gig-1',
  gig_revision: '2',
  occurred_at: '2026-08-13T10:00:00.000Z',
  gig,
}

test('parses a complete authoritative gig feed frame', () => {
  assert.deepEqual(parseWsServerFrame(available), available)
})

test('rejects malformed, private-looking, and incomplete feed frames', () => {
  assert.equal(parseWsServerFrame(null), null)
  assert.equal(parseWsServerFrame({ ...available, channel: 'escrow:gig-1' }), null)
  assert.equal(parseWsServerFrame({ ...available, gig: { ...gig, public_feed_revision: undefined } }), null)
  assert.equal(parseWsServerFrame({ ...available, gig_revision: '-1' }), null)
  assert.equal(parseWsServerFrame({ ...available, occurred_at: 'not-a-date' }), null)
  assert.equal(parseWsServerFrame({ ...available, gig: { ...gig, amount_raw: '1.5' } }), null)
  assert.equal(parseWsServerFrame({ ...available, gig: { ...gig, amount_raw: '01' } }), null)
  assert.equal(parseWsServerFrame({ ...available, gig: { ...gig, status: 'accepted' } }), null)
  assert.equal(parseWsServerFrame({ ...available, gig: { ...gig, created_at: '2026-08-13' } }), null)
  assert.equal(parseWsServerFrame({ ...available, gig: { ...gig, proof_requirements: ['invented'] } }), null)
  assert.equal(parseWsServerFrame({ ...available, gig: { ...gig, creator: { id: 'user-1' } } }), null)
  assert.equal(parseWsServerFrame({ ...available, escrow_id: 'another-gig' }), null)
  assert.equal(parseWsServerFrame({ ...available, gig_revision: '3' }), null)
  assert.equal(parseWsServerFrame({ ...available, type: 'gig_unavailable', gig: undefined, cause: 'invented' }), null)
})

test('rejects valid payload shapes delivered on inconsistent private channels', () => {
  const message = {
    channel: 'chat:conversation-b',
    type: 'message',
    message: {
      id: 'm1', conversation_id: 'conversation-a', sender_id: 'u1', content: 'hello',
      escrow_id: null, escrow_title: null, escrow_kind: null,
      attachment_url: null, attachment_type: null, attachment_size: null,
      read_at: null, created_at: null,
    },
  }
  const escrowEvent = {
    channel: 'escrow:escrow-b',
    type: 'escrow_event',
    escrow_id: 'escrow-a',
    event: 'EscrowAccepted',
    tx_ref: 'tx1',
  }
  const notification = {
    channel: 'feed:gigs',
    type: 'notification',
    notification: {
      id: 'n1', title: 'Title', body: 'Body', data: null, read_at: null, created_at: null,
    },
  }

  assert.equal(parseWsServerFrame(message), null)
  assert.equal(parseWsServerFrame(escrowEvent), null)
  assert.equal(parseWsServerFrame(notification), null)
})

test('rejects incomplete private wire projections instead of asserting them complete', () => {
  const message = {
    channel: 'chat:c1',
    type: 'message',
    message: {
      id: 'm1', conversation_id: 'c1', sender_id: 'u1', content: 'hello',
      escrow_id: null, escrow_title: null, escrow_kind: null,
      attachment_url: 'https://example.test/file', attachment_type: null, attachment_size: 10,
      read_at: null, created_at: null,
    },
  }
  const notification = {
    channel: 'user:u1',
    type: 'notification',
    notification: {
      id: 'n1', title: 'Title', body: 'Body', data: { screen: 42 }, read_at: null, created_at: null,
    },
  }

  assert.equal(parseWsServerFrame(message), null)
  assert.equal(parseWsServerFrame(notification), null)
})
