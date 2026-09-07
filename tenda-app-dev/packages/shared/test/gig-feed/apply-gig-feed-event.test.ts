import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { GigAvailableFrame, GigUnavailableFrame } from '../../src/api/contracts/ws.contract'
import type { GigSummary } from '../../src/types/gig'
import type { UserRef } from '../../src/types/user'
import {
  applyGigFeedEvent,
  classifyGigFeedQuery,
  compareGigFeedRevisions,
  compareGigSummariesByRecency,
  matchesGigFeedQuery,
  type GigFeedState,
} from '../../src/gig-feed'

// Typed, so a field the wire does not carry cannot ride along in a fixture.
const creator: UserRef = {
  id: 'user-1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  avatar_url: null,
  country: 'NG',
  is_seeker: false,
  is_agent: false,
  review_score: null,
}

/** The projection a caller that stores whole summaries supplies. */
const identity = (item: GigSummary): GigSummary => item

function gig(escrow_id: string, created_at: string, overrides: Partial<GigSummary> = {}): GigSummary {
  return {
    escrow_id,
    public_feed_revision: '0',
    chain_id: 'solana:devnet',
    asset: 'USDC_SOL_DEVNET',
    amount_raw: '1000000',
    status: 'open',
    accept_deadline: null,
    created_at,
    title: `Gig ${escrow_id}`,
    description: null,
    category: 'delivery',
    country: 'NG',
    city: 'Lagos',
    latitude: null,
    longitude: null,
    remote: false,
    cross_border: false,
    proof_requirements: [],
    proof_params: null,
    requires_approval: false,
    creator,
    ...overrides,
  }
}

function available(item: GigSummary, revision: string): GigAvailableFrame {
  return {
    channel: 'feed:gigs',
    type: 'gig_available',
    event_id: `event-${revision}`,
    escrow_id: item.escrow_id,
    gig_revision: revision,
    occurred_at: '2026-08-13T10:00:00.000Z',
    gig: item,
  }
}

function unavailable(escrow_id: string, revision: string): GigUnavailableFrame {
  return {
    channel: 'feed:gigs',
    type: 'gig_unavailable',
    event_id: `event-${revision}`,
    escrow_id,
    gig_revision: revision,
    occurred_at: '2026-08-13T10:00:00.000Z',
    cause: 'accepted',
  }
}

const empty: GigFeedState = { items: [], revisions: {} }

test('available inserts in deterministic recency order without mutating input', () => {
  const older = gig('a', '2026-08-12T10:00:00.000Z')
  const state: GigFeedState = { items: [older], revisions: { a: '1' } }
  const result = applyGigFeedEvent({
    state,
    event: available(gig('b', '2026-08-13T10:00:00.000Z'), '1'),
    query: {},
    project: identity,
  })
  assert.equal(result.outcome, 'applied')
  assert.deepEqual(result.state.items.map((item) => item.escrow_id), ['b', 'a'])
  assert.deepEqual(state.items, [older])
})

test('higher revision replaces and lower/equal revisions cannot overwrite it', () => {
  const original = gig('a', '2026-08-12T10:00:00.000Z')
  const state: GigFeedState = { items: [original], revisions: { a: '9' } }
  const updated = applyGigFeedEvent({
    state,
    event: available({ ...original, title: 'Updated' }, '10'),
    query: {},
    project: identity,
  })
  assert.equal(updated.outcome, 'applied')
  assert.equal(updated.state.items[0].title, 'Updated')
  assert.equal(applyGigFeedEvent({ state: updated.state, event: unavailable('a', '9'), query: {}, project: identity }).outcome, 'ignored_stale')
  assert.equal(applyGigFeedEvent({ state: updated.state, event: unavailable('a', '10'), query: {}, project: identity }).outcome, 'ignored_duplicate')
})

test('unavailable removes a known row and records revision for replay protection', () => {
  const state: GigFeedState = { items: [gig('a', '2026-08-12T10:00:00.000Z')], revisions: {} }
  const result = applyGigFeedEvent({ state, event: unavailable('a', '4'), query: {}, project: identity })
  assert.equal(result.outcome, 'applied')
  assert.deepEqual(result.state.items, [])
  assert.equal(result.state.revisions.a, '4')
})

test('deterministic filters exclude non-matching available gigs', () => {
  const item = gig('a', '2026-08-12T10:00:00.000Z')
  assert.equal(matchesGigFeedQuery(item, { country: 'NG', category: 'delivery', min_amount_raw: '1' }), true)
  assert.equal(matchesGigFeedQuery(item, { country: 'GH' }), false)
  assert.equal(matchesGigFeedQuery(item, { city: 'Abuja' }), false)
  assert.equal(matchesGigFeedQuery(item, { category: 'service' }), false)
  assert.equal(matchesGigFeedQuery(item, { remote: true }), false)
  assert.equal(matchesGigFeedQuery(item, { cross_border: true }), false)
  assert.equal(matchesGigFeedQuery(item, { chain_id: 'eip155:8453' }), false)
  assert.equal(matchesGigFeedQuery(item, { min_amount_raw: '1000001' }), false)
  assert.equal(matchesGigFeedQuery(item, { max_amount_raw: '999999' }), false)
  const result = applyGigFeedEvent({ state: empty, event: available(item, '1'), query: { remote: true }, project: identity })
  assert.equal(result.outcome, 'applied')
  assert.deepEqual(result.state.items, [])
})

test('full-text search explicitly requires authoritative reconciliation', () => {
  const event = available(gig('a', '2026-08-12T10:00:00.000Z'), '1')
  assert.equal(classifyGigFeedQuery({ q: 'deliver' }), 'server_reconciliation_required')
  const result = applyGigFeedEvent({ state: empty, event, query: { q: 'deliver' }, project: identity })
  assert.equal(result.outcome, 'reconciliation_required')
  assert.strictEqual(result.state, empty)
})

test('server-owned membership and ordering never get approximated locally', () => {
  const serverOnlyQueries = [
    { lat: 6.5, lng: 3.3, radius_km: 10 },
    { sort: 'amount_asc' as const },
    { sort: 'amount_desc' as const },
    { mine: 'created' as const },
    { status: ['open' as const] },
  ]
  for (const query of serverOnlyQueries) {
    assert.equal(classifyGigFeedQuery(query), 'server_reconciliation_required')
    assert.equal(
      applyGigFeedEvent({ state: empty, event: available(gig('a', '2026-08-12T10:00:00Z'), '1'), query, project: identity }).outcome,
      'reconciliation_required',
    )
  }
  assert.equal(classifyGigFeedQuery({ sort: 'created_at' }), 'client_matchable')
})

test('invalid or non-canonical amount filters cannot throw during realtime application', () => {
  for (const min_amount_raw of ['not-a-decimal', '-1', '01']) {
    const query = { min_amount_raw }
    const result = applyGigFeedEvent({
      state: empty,
      event: available(gig('a', '2026-08-12T10:00:00Z'), '1'),
      query,
      project: identity,
    })
    assert.equal(classifyGigFeedQuery(query), 'server_reconciliation_required')
    assert.equal(result.outcome, 'reconciliation_required')
  }
})

test('unavailable remains safe under a full-text query', () => {
  const state: GigFeedState = { items: [gig('a', '2026-08-12T10:00:00.000Z')], revisions: {} }
  const result = applyGigFeedEvent({ state, event: unavailable('a', '2'), query: { q: 'deliver' }, project: identity })
  assert.equal(result.outcome, 'applied')
  assert.deepEqual(result.state.items, [])
})

test('revision comparison supports values beyond Number.MAX_SAFE_INTEGER and refuses bad input', () => {
  assert.equal(compareGigFeedRevisions('90071992547409930', '90071992547409929'), 1)
  assert.equal(compareGigFeedRevisions('7', '7'), 0)
  assert.throws(() => compareGigFeedRevisions('0007', '7'), /non-negative decimal/)
  assert.throws(() => compareGigFeedRevisions('-1', '1'), /non-negative decimal/)
})

test('recency ordering puts the newer gig first and uses escrow id as a stable tie-breaker', () => {
  const timestamp = '2026-08-13T10:00:00.000Z'
  const older = '2026-08-12T10:00:00.000Z'
  // Newer first, whichever side it is on — the ordering, not just a sign.
  assert.equal(compareGigSummariesByRecency(gig('a', timestamp), gig('a', older)), -1)
  assert.equal(compareGigSummariesByRecency(gig('a', older), gig('a', timestamp)), 1)
  // Equal timestamps fall through to the id, descending.
  assert.equal(compareGigSummariesByRecency(gig('b', timestamp), gig('a', timestamp)), -1)
  assert.equal(compareGigSummariesByRecency(gig('a', timestamp), gig('b', timestamp)), 1)
  assert.equal(compareGigSummariesByRecency(gig('a', timestamp), gig('a', timestamp)), 0)
})

test('blank search stays client-matchable while partial proximity and invalid max require server truth', () => {
  assert.equal(classifyGigFeedQuery({ q: '   ' }), 'client_matchable')
  assert.equal(classifyGigFeedQuery({ lat: 6.5 }), 'server_reconciliation_required')
  assert.equal(classifyGigFeedQuery({ max_amount_raw: '01' }), 'server_reconciliation_required')
})

/**
 * The projected case — the reason the reducer is generic at all. The anonymous
 * feed stores a trimmed card model (no `amount_raw`; the page keeps base units
 * out of what it ships to the browser), so the frame's full gig has to survive
 * long enough to be MATCHED and then be narrowed before it is stored.
 */
test('a caller that stores less than a summary matches on the full gig and stores the projection', () => {
  interface Card { escrow_id: string; created_at: string; title: string }
  const toCard = (item: GigSummary): Card => ({
    escrow_id: item.escrow_id,
    created_at: item.created_at,
    title: item.title,
  })
  const state: GigFeedState<Card> = { items: [], revisions: {} }

  // Matching still reads a field the stored shape does not carry.
  const priced = applyGigFeedEvent({
    state,
    event: available(gig('a', '2026-08-12T10:00:00.000Z'), '1'),
    query: { min_amount_raw: '1000000' },
    project: toCard,
  })
  assert.equal(priced.outcome, 'applied')
  assert.deepEqual(priced.state.items, [
    { escrow_id: 'a', created_at: '2026-08-12T10:00:00.000Z', title: 'Gig a' },
  ])

  // ...and excludes on that same field, which no card could answer.
  const tooDear = applyGigFeedEvent({
    state,
    event: available(gig('b', '2026-08-13T10:00:00.000Z'), '1'),
    query: { min_amount_raw: '1000001' },
    project: toCard,
  })
  assert.equal(tooDear.outcome, 'applied')
  assert.deepEqual(tooDear.state.items, [])

  // Ordering and removal work on the projection, not the summary.
  const two = applyGigFeedEvent({
    state: priced.state,
    event: available(gig('c', '2026-08-14T10:00:00.000Z'), '1'),
    query: {},
    project: toCard,
  })
  assert.deepEqual(two.state.items.map((item) => item.escrow_id), ['c', 'a'])
  const removed = applyGigFeedEvent({
    state: two.state,
    event: unavailable('c', '2'),
    query: {},
    project: toCard,
  })
  assert.deepEqual(removed.state.items.map((item) => item.escrow_id), ['a'])
})
