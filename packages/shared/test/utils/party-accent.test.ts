/**
 * The role→accent mapping every dispute surface shares. Its own file rather
 * than an addendum to parties.test.ts, which is already at 296 lines.
 *
 * Pinned because two surfaces drifting apart is the whole reason it exists —
 * and since #43 that includes the two CLIENTS, which each held a private copy
 * of this map while promising it could not drift.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { partyAccent, type PartyAccent, type PartyRole } from '../../src/utils/parties'

test('partyAccent: the creator side is the accent tone', () => {
  assert.equal(partyAccent('creator'), 'accent')
})

test('partyAccent: the counterparty side is the brand tone', () => {
  assert.equal(partyAccent('counterparty'), 'brand')
})

test('partyAccent: the two sides never collide', () => {
  // The property the surfaces actually depend on — a header chip and a thread
  // stripe must be able to tell the parties apart at a glance.
  assert.notEqual(partyAccent('creator'), partyAccent('counterparty'))
})

/**
 * Total over each union ON PURPOSE, the same technique attachment.test.ts uses
 * for MessageAttachmentType and for the same reason: `const roles: PartyRole[]
 * = ['creator','counterparty']` would still compile after PartyRole gained a
 * third member, so a test named "total" would not have been. A Record misses a
 * key and stops the suite compiling.
 */
const EVERY_ROLE: Record<PartyRole, true> = { creator: true, counterparty: true }
const EVERY_ACCENT: Record<PartyAccent, true> = { accent: true, brand: true }

test('partyAccent: total over PartyRole, and answers only with accent tokens', () => {
  // Nothing here may return undefined: both consumers index a presentation
  // table with the answer, and an undefined key renders an untinted element
  // rather than throwing.
  for (const role of Object.keys(EVERY_ROLE) as PartyRole[]) {
    const accent = partyAccent(role)
    assert.ok(accent in EVERY_ACCENT, `role "${role}" answered with "${accent}"`)
  }
})
