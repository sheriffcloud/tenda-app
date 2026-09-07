/**
 * features/reputation — signal mapping, tier evaluation with crossing-only
 * emission, fraud hold, the operation gate, and the public roll-up.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  activeRestriction,
  applyFraudConfirmed,
  applyStandingEvent,
  checkOperationAllowed,
  defaultRestrictionReason,
  toPublicStanding,
  type ReputationDeps,
  type ReputationStore,
  type StandingRow,
} from '@server/features/reputation/service'
import { signalsFor } from '@server/features/reputation/signals'
import {
  COLD_START_MIN_OUTCOMES,
  RESTRICTION_TIERS,
} from '@server/features/reputation/config'
import type { StandingEventKind } from '@tenda/shared/db/schema/reputation'

const NOW = new Date('2026-06-04T12:00:00Z')
const PARTIES = { creator_id: 'creator-1', counterparty_id: 'cp-1' }

// ---------- signal mapping ------------------------------------------------------

test('signalsFor: approved → both completed; payment_claimed → ghosted creator', () => {
  assert.deepStrictEqual(signalsFor('escrow.approved', { parties: PARTIES }), [
    { user_id: 'creator-1', kind: 'completed', role: 'creator' },
    { user_id: 'cp-1', kind: 'completed', role: 'counterparty' },
  ])
  assert.deepStrictEqual(signalsFor('escrow.payment_claimed', { parties: PARTIES }), [
    { user_id: 'cp-1', kind: 'completed', role: 'counterparty' },
    { user_id: 'creator-1', kind: 'ghosted_approval', role: 'creator' },
  ])
})

test('signalsFor: abandoned hits counterparty; cancelled neutral creator; expired/declined nothing', () => {
  assert.deepStrictEqual(signalsFor('escrow.abandoned', { parties: PARTIES }), [
    { user_id: 'cp-1', kind: 'abandoned', role: 'counterparty' },
  ])
  assert.deepStrictEqual(signalsFor('escrow.cancelled', { parties: PARTIES }), [
    { user_id: 'creator-1', kind: 'cancelled', role: 'creator' },
  ])
  assert.deepStrictEqual(signalsFor('escrow.expired', { parties: PARTIES }), [])
  assert.deepStrictEqual(signalsFor('escrow.declined', { parties: PARTIES }), [])
  assert.deepStrictEqual(signalsFor('escrow.created', { parties: PARTIES }), [])
})

test('signalsFor dispute_resolved: winner/loser; split assigns no fault', () => {
  const creatorWins = signalsFor('escrow.dispute_resolved', {
    parties: PARTIES,
    dispute: { winner: 'creator', raised_by: 'cp-1' },
  })
  assert.deepStrictEqual(creatorWins, [
    { user_id: 'creator-1', kind: 'disputed_won', role: 'creator' },
    { user_id: 'cp-1', kind: 'disputed_lost', role: 'counterparty' },
  ])
  assert.deepStrictEqual(
    signalsFor('escrow.dispute_resolved', {
      parties: PARTIES,
      dispute: { winner: 'split', raised_by: 'cp-1' },
    }),
    [],
  )
})

// ---------- D2: who is actually accountable for an abandonment ----------------
// The strike exists to punish a worker who CHOSE a gig and then went quiet.
// Approval mode breaks the old assumption that being the counterparty implies
// having chosen it, so the rule needs both new facts to stay fair.

test('abandoned: the ordinary instant accept still earns the strike', () => {
  // requires_approval false — the worker signed acceptEscrow themselves, so
  // `assigned_from_application: false` here means nothing and must not excuse.
  assert.deepStrictEqual(
    signalsFor('escrow.abandoned', {
      parties: PARTIES,
      requires_approval: false,
      assigned_from_application: false,
    }),
    [{ user_id: 'cp-1', kind: 'abandoned', role: 'counterparty' }],
  )
})

test('abandoned: a worker assigned FROM THEIR OWN application still earns it', () => {
  assert.deepStrictEqual(
    signalsFor('escrow.abandoned', {
      parties: PARTIES,
      requires_approval: true,
      assigned_from_application: true,
    }),
    [{ user_id: 'cp-1', kind: 'abandoned', role: 'counterparty' }],
  )
})

test('abandoned: a BACK-DOOR assign earns nothing — they never opted in', () => {
  assert.deepStrictEqual(
    signalsFor('escrow.abandoned', {
      parties: PARTIES,
      requires_approval: true,
      assigned_from_application: false,
    }),
    [],
  )
})

test('abandoned: releasing in time suppresses the strike, however they were assigned', () => {
  for (const from of [true, false]) {
    assert.deepStrictEqual(
      signalsFor('escrow.abandoned', {
        parties: PARTIES,
        requires_approval: true,
        assigned_from_application: from,
        assignment_released: true,
      }),
      [],
      `assigned_from_application=${from}`,
    )
  }
  // …and it suppresses an instant-mode strike too: a worker who said they
  // could not do it is not a worker who ghosted.
  assert.deepStrictEqual(
    signalsFor('escrow.abandoned', {
      parties: PARTIES,
      requires_approval: false,
      assignment_released: true,
    }),
    [],
  )
})

// Absent context must behave exactly as before this feature existed, or every
// pre-approval-mode escrow silently stops earning strikes.
test('abandoned: with no mode context at all, the strike is unchanged', () => {
  assert.deepStrictEqual(signalsFor('escrow.abandoned', { parties: PARTIES }), [
    { user_id: 'cp-1', kind: 'abandoned', role: 'counterparty' },
  ])
})

test('signalsFor: events needing a counterparty are silent when none exists', () => {
  const noCp = { creator_id: 'creator-1', counterparty_id: null }
  assert.deepStrictEqual(signalsFor('escrow.approved', { parties: noCp }), [])
  assert.deepStrictEqual(signalsFor('escrow.abandoned', { parties: noCp }), [])
})

// ---------- service with in-memory store ------------------------------------------

interface MemState {
  events: Array<{ user_id: string; kind: StandingEventKind }>
  standings: Map<string, StandingRow>
  emitted: Array<{ user_id: string; kind: string }>
}

function blankRow(): StandingRow {
  return {
    completed_count: 0,
    abandoned_count: 0,
    ghosted_count: 0,
    disputed_won_count: 0,
    disputed_lost_count: 0,
    fraud_confirmed_count: 0,
    restriction_until: null,
    restriction_kind: null,
    restriction_reason: null,
  }
}

function makeDeps(): { deps: ReputationDeps; state: MemState } {
  const state: MemState = { events: [], standings: new Map(), emitted: [] }
  const store: ReputationStore = {
    async getEscrowContext() {
      return { parties: PARTIES }
    },
    async insertStandingEvent(e) {
      state.events.push({ user_id: e.user_id, kind: e.kind })
    },
    async bumpCounter(user_id) {
      if (!state.standings.has(user_id)) state.standings.set(user_id, blankRow())
    },
    async countInWindow(user_id, kind) {
      return state.events.filter((e) => e.user_id === user_id && e.kind === kind).length
    },
    async getStanding(user_id) {
      return state.standings.get(user_id) ?? null
    },
    async setRestriction(user_id, r) {
      const row = state.standings.get(user_id) ?? blankRow()
      row.restriction_kind = r.kind
      row.restriction_until = r.until
      row.restriction_reason = r.reason
      state.standings.set(user_id, row)
    },
    async clearRestriction(user_id) {
      const row = state.standings.get(user_id)
      if (row) {
        row.restriction_kind = null
        row.restriction_until = null
        row.restriction_reason = null
      }
    },
    async resetCounters() {},
  }
  const deps: ReputationDeps = {
    store,
    emit: {
      async restricted(user_id, kind) {
        state.emitted.push({ user_id, kind: `restricted:${kind}` })
      },
      async cleared(user_id) {
        state.emitted.push({ user_id, kind: 'cleared' })
      },
    },
    now: () => NOW,
  }
  return { deps, state }
}

test('3rd abandonment in window applies the 7-day accept cooldown — crossing emits once', async () => {
  const { deps, state } = makeDeps()
  for (let i = 0; i < 3; i += 1) {
    await applyStandingEvent(deps, { internal_event: 'escrow.abandoned', escrow_id: `e-${i}` })
  }
  const row = state.standings.get('cp-1')
  assert.strictEqual(row?.restriction_kind, 'accept_cooldown')
  assert.strictEqual(
    row?.restriction_until?.getTime(),
    NOW.getTime() + 7 * 86_400_000,
  )
  // Emitted exactly once — events 1 and 2 are below threshold; 3 crosses.
  assert.deepStrictEqual(state.emitted, [{ user_id: 'cp-1', kind: 'restricted:accept_cooldown' }])
})

test('5th abandonment escalates to the 30-day tier (strictest wins) and re-emits the crossing', async () => {
  const { deps, state } = makeDeps()
  for (let i = 0; i < 5; i += 1) {
    await applyStandingEvent(deps, { internal_event: 'escrow.abandoned', escrow_id: `e-${i}` })
  }
  const row = state.standings.get('cp-1')
  assert.strictEqual(row?.restriction_until?.getTime(), NOW.getTime() + 30 * 86_400_000)
  // Two crossings: at 3 (7d) and at 5 (30d). The 4th event keeps 7d — no emit.
  assert.strictEqual(state.emitted.length, 2)
})

test('manual_review is never overridden by tier evaluation', async () => {
  const { deps, state } = makeDeps()
  state.standings.set('cp-1', {
    ...blankRow(),
    restriction_kind: 'manual_review',
    restriction_reason: 'fraud',
  })
  for (let i = 0; i < 5; i += 1) {
    await applyStandingEvent(deps, { internal_event: 'escrow.abandoned', escrow_id: `e-${i}` })
  }
  assert.strictEqual(state.standings.get('cp-1')?.restriction_kind, 'manual_review')
  assert.strictEqual(state.emitted.length, 0)
})

test('applyFraudConfirmed applies an unexpiring manual_review immediately', async () => {
  const { deps, state } = makeDeps()
  await applyFraudConfirmed(deps, { user_id: 'cp-1', escrow_id: null, role: 'counterparty' })
  const row = state.standings.get('cp-1')
  assert.strictEqual(row?.restriction_kind, 'manual_review')
  assert.strictEqual(row?.restriction_until, null)
})

// ---------- operation gate ---------------------------------------------------------

function gateDeps(row: StandingRow | null) {
  return {
    store: {
      async getStanding() {
        return row
      },
    },
    now: () => NOW,
  }
}

test('gate: no record / no restriction / expired restriction → allowed', async () => {
  assert.deepStrictEqual(await checkOperationAllowed(gateDeps(null), 'u', 'accept'), {
    allowed: true,
  })
  assert.deepStrictEqual(await checkOperationAllowed(gateDeps(blankRow()), 'u', 'create'), {
    allowed: true,
  })
  const expired = {
    ...blankRow(),
    restriction_kind: 'accept_cooldown' as const,
    restriction_until: new Date(NOW.getTime() - 1),
    restriction_reason: 'old',
  }
  assert.deepStrictEqual(await checkOperationAllowed(gateDeps(expired), 'u', 'accept'), {
    allowed: true,
  })
})

test('gate: kind blocks only its operation; manual_review blocks all', async () => {
  const cooldown = {
    ...blankRow(),
    restriction_kind: 'accept_cooldown' as const,
    restriction_until: new Date(NOW.getTime() + 86_400_000),
    restriction_reason: 'abandoned too much',
  }
  const blocked = await checkOperationAllowed(gateDeps(cooldown), 'u', 'accept')
  assert.strictEqual(blocked.allowed, false)
  assert.deepStrictEqual(await checkOperationAllowed(gateDeps(cooldown), 'u', 'create'), {
    allowed: true,
  })

  const review = {
    ...blankRow(),
    restriction_kind: 'manual_review' as const,
    restriction_reason: 'fraud',
  }
  for (const op of ['create', 'accept', 'dispute'] as const) {
    const r = await checkOperationAllowed(gateDeps(review), 'u', op)
    assert.strictEqual(r.allowed, false)
  }
})

// ---------- public roll-up ------------------------------------------------------------

test('public standing: cold start null rate; raw counters never exposed', () => {
  const fresh = toPublicStanding(
    { ...blankRow(), completed_count: COLD_START_MIN_OUTCOMES - 1 },
    NOW,
  )
  assert.strictEqual(fresh.completion_rate, null)

  const seasoned = toPublicStanding(
    { ...blankRow(), completed_count: 9, abandoned_count: 1 },
    NOW,
  )
  assert.strictEqual(seasoned.completion_rate, 0.9)
  assert.strictEqual('abandoned_count' in seasoned, false)
})

test('public standing: dispute_cooldown stays private; accept_cooldown shows limited', () => {
  const disputeOnly = toPublicStanding(
    {
      ...blankRow(),
      restriction_kind: 'dispute_cooldown',
      restriction_until: new Date(NOW.getTime() + 1000),
      restriction_reason: 'x',
    },
    NOW,
  )
  assert.strictEqual(disputeOnly.is_limited, false)

  const limited = toPublicStanding(
    {
      ...blankRow(),
      restriction_kind: 'accept_cooldown',
      restriction_until: new Date(NOW.getTime() + 1000),
      restriction_reason: 'x',
    },
    NOW,
  )
  assert.strictEqual(limited.is_limited, true)
})

test('tier table sanity: thresholds strictly increase per kind with durations', () => {
  const byKind = new Map<string, number[]>()
  for (const t of RESTRICTION_TIERS) {
    const arr = byKind.get(t.kind) ?? []
    arr.push(t.threshold)
    byKind.set(t.kind, arr)
  }
  for (const [, thresholds] of byKind) {
    const sorted = [...thresholds].sort((a, b) => a - b)
    assert.deepStrictEqual(thresholds, sorted)
  }
})

test('activeRestriction: null row / no kind / expired → null; unexpiring + future stay active', () => {
  assert.strictEqual(activeRestriction(null, NOW), null)
  assert.strictEqual(activeRestriction(blankRow(), NOW), null)
  assert.strictEqual(
    activeRestriction(
      { ...blankRow(), restriction_kind: 'accept_cooldown', restriction_until: new Date(NOW.getTime() - 1) },
      NOW,
    ),
    null,
  )
  const future = activeRestriction(
    {
      ...blankRow(),
      restriction_kind: 'accept_cooldown',
      restriction_until: new Date(NOW.getTime() + 1000),
      restriction_reason: 'too many abandonments',
    },
    NOW,
  )
  assert.deepStrictEqual(future, {
    kind: 'accept_cooldown',
    until: new Date(NOW.getTime() + 1000),
    reason: 'too many abandonments',
  })
  // manual_review has no until — stays active indefinitely.
  const review = activeRestriction(
    { ...blankRow(), restriction_kind: 'manual_review', restriction_until: null, restriction_reason: null },
    NOW,
  )
  assert.deepStrictEqual(review, { kind: 'manual_review', until: null, reason: null })
})

test('defaultRestrictionReason: manual_review wording differs from cooldowns', () => {
  assert.strictEqual(defaultRestrictionReason('manual_review'), 'account under review')
  assert.strictEqual(defaultRestrictionReason('accept_cooldown'), 'temporarily restricted')
  assert.strictEqual(defaultRestrictionReason('dispute_cooldown'), 'temporarily restricted')
})
