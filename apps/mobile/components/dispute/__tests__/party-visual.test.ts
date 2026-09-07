/**
 * The role→colour mapping the context header and the mediation bubbles share.
 * Pinned because the two surfaces drifting apart is the whole reason it exists.
 */
import { partyAccent } from '@/components/dispute/party-visual'

test('the creator side is the accent tone', () => {
  expect(partyAccent('creator')).toBe('accent')
})

test('the counterparty side is the brand tone', () => {
  expect(partyAccent('counterparty')).toBe('brand')
})

test('the two sides never collide', () => {
  expect(partyAccent('creator')).not.toBe(partyAccent('counterparty'))
})
