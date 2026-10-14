/**
 * Takedown copy + audience derivation: the three audiences read distinct,
 * correctly-emphasised messages, and the audience comes from wire ids only.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  takedownAudience,
  takedownCopy,
  type TakedownAudience,
  type TakedownEscrow,
} from '../../src/takedown/copy'

test('says "offer" on the exchange surface, "gig" on the gig one', () => {
  assert.match(takedownCopy('owner', 'offer').detail, /this offer/i)
  assert.match(takedownCopy('owner', 'gig').detail, /this gig/i)
  assert.match(takedownCopy('moderator', 'offer').detail, /order book/i)
  assert.match(takedownCopy('moderator', 'gig').detail, /feed/i)
})

test('every audience gets non-empty, distinct wording', () => {
  const audiences: TakedownAudience[] = ['owner', 'counterparty', 'moderator']
  const titles = audiences.map((a) => takedownCopy(a, 'gig').title)
  assert.strictEqual(new Set(titles).size, audiences.length)
  for (const a of audiences) {
    const { title, detail } = takedownCopy(a, 'gig')
    assert.ok(title.trim() !== '')
    assert.ok(detail.trim() !== '')
  }
})

test('the owner is reassured about the money; the counterparty told to carry on', () => {
  assert.match(takedownCopy('owner', 'gig').detail, /escrow.*unaffected/i)
  assert.match(takedownCopy('counterparty', 'gig').detail, /carry on|unchanged/i)
})

const escrow = (over: Partial<TakedownEscrow> = {}): TakedownEscrow => ({
  hidden: true,
  creator: { id: 'creator-1' },
  counterparty: null,
  assigned_counterparty_id: null,
  ...over,
})

test('audience: creator → owner; counterparty or invitee → counterparty; else moderator', () => {
  assert.strictEqual(takedownAudience(escrow(), 'creator-1'), 'owner')
  assert.strictEqual(
    takedownAudience(escrow({ counterparty: { id: 'worker-1' } }), 'worker-1'),
    'counterparty',
  )
  assert.strictEqual(
    takedownAudience(escrow({ assigned_counterparty_id: 'invitee-1' }), 'invitee-1'),
    'counterparty',
  )
  assert.strictEqual(takedownAudience(escrow(), 'someone-else'), 'moderator')
})
