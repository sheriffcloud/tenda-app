import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ESCROW_BRANCH_STATUSES,
  ESCROW_SPINE,
  buildEscrowTimeline,
  isSpineStatus,
} from '../../src/utils/escrow/timeline'
import { ESCROW_STATUS_ORDER } from '../../src/constants/escrow'

const states = (status: Parameters<typeof buildEscrowTimeline>[0]['status'], extra = {}) =>
  buildEscrowTimeline({ status, ...extra }).spine.map((n) => n.state)

test('the spine and the branch together cover every canonical status', () => {
  const covered = [...ESCROW_SPINE, ...ESCROW_BRANCH_STATUSES].sort()
  assert.deepEqual(covered, [...ESCROW_STATUS_ORDER].sort())
})

test('the two sets never overlap', () => {
  for (const status of ESCROW_BRANCH_STATUSES) assert.equal(isSpineStatus(status), false)
  for (const status of ESCROW_SPINE) assert.equal(isSpineStatus(status), true)
})

test('disputed is a BRANCH, not a step on the happy path', () => {
  // The whole point of the shape: rendering the canonical order would put a
  // dispute after completion.
  assert.equal(isSpineStatus('disputed'), false)
  assert.equal(buildEscrowTimeline({ status: 'disputed' }).branch, 'disputed')
})

test('completed is the END of the spine, not a branch', () => {
  assert.equal(isSpineStatus('completed'), true)
  assert.equal(buildEscrowTimeline({ status: 'completed' }).branch, null)
})

test('an open escrow is current at the first node, the rest upcoming', () => {
  assert.deepEqual(states('open'), ['current', 'upcoming', 'upcoming', 'upcoming'])
})

test('progress marks earlier nodes done and the current one current', () => {
  assert.deepEqual(states('accepted'), ['done', 'current', 'upcoming', 'upcoming'])
  assert.deepEqual(states('submitted'), ['done', 'done', 'current', 'upcoming'])
  assert.deepEqual(states('completed'), ['done', 'done', 'done', 'current'])
})

test('a draft has walked none of the spine — it was never funded', () => {
  assert.deepEqual(states('draft'), ['upcoming', 'upcoming', 'upcoming', 'upcoming'])
  assert.equal(buildEscrowTimeline({ status: 'draft' }).branch, null)
})

test('a branched escrow has NO current spine node — the branch is where it stopped', () => {
  for (const status of ESCROW_BRANCH_STATUSES) {
    const timeline = buildEscrowTimeline({ status })
    assert.equal(timeline.branch, status)
    assert.ok(!timeline.spine.some((n) => n.state === 'current'), `${status} marked a spine node current`)
  }
})

test('a branch claims only the progress the wire evidences', () => {
  // Cancelled from anywhere: all we know is it existed on-chain.
  assert.deepEqual(states('cancelled'), ['done', 'upcoming', 'upcoming', 'upcoming'])
  // Submitted then disputed: submission implies acceptance, so both are done.
  assert.deepEqual(states('disputed', { submitted_at: '2026-01-02T00:00:00Z' }), [
    'done',
    'done',
    'done',
    'upcoming',
  ])
})

test('stamps come only from fields the wire actually carries', () => {
  const timeline = buildEscrowTimeline({
    status: 'submitted',
    created_at: '2026-01-01T00:00:00Z',
    submitted_at: '2026-01-02T00:00:00Z',
  })
  const byStatus = Object.fromEntries(timeline.spine.map((n) => [n.status, n.stamp]))
  assert.equal(byStatus.open, '2026-01-01T00:00:00Z')
  assert.equal(byStatus.submitted, '2026-01-02T00:00:00Z')
  // accepted/completed have no timestamp on the wire (spec-correction #9):
  // say nothing rather than invent one.
  assert.equal(byStatus.accepted, null)
  assert.equal(byStatus.completed, null)
})

test('missing timestamps degrade to null rather than undefined', () => {
  for (const node of buildEscrowTimeline({ status: 'open' }).spine) {
    assert.equal(node.stamp, null)
  }
})

test('every canonical status produces a full four-node spine', () => {
  for (const status of ESCROW_STATUS_ORDER) {
    assert.equal(buildEscrowTimeline({ status }).spine.length, ESCROW_SPINE.length)
  }
})

test('an empty timestamp is treated as absent, never as evidence of progress', () => {
  // Off-contract input, but the failure mode is claiming an escrow reached a
  // step it never did — on a display about someone's money.
  assert.deepEqual(states('disputed', { submitted_at: '' }), [
    'done',
    'upcoming',
    'upcoming',
    'upcoming',
  ])
})

test('an empty timestamp renders no stamp rather than an empty line', () => {
  const timeline = buildEscrowTimeline({ status: 'submitted', created_at: '', submitted_at: '' })
  for (const node of timeline.spine) assert.equal(node.stamp, null)
})
