/**
 * chainDisplay — one CAIP-2 id in, everything a chain badge draws out.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chainDisplay } from '../../src/utils/chain-display'
import { chainLabel } from '../../src/utils/chain-label'
import { CHAIN_FALLBACK_GLYPH, CHAIN_GLYPH_INK, chainFamilyDisplay } from '../../src/chains/display'
import { CHAIN_MANIFEST } from '../../src/chains/manifest'

test('labels through chainLabel — the manifest display name, testnets included', () => {
  assert.equal(chainDisplay('solana:devnet').label, 'Solana Devnet')
  assert.equal(chainDisplay('eip155:84532').label, 'Base Sepolia')
  for (const entry of CHAIN_MANIFEST) {
    assert.equal(chainDisplay(entry.id).label, chainLabel(entry.id))
  }
})

test('carries the family glyph, colour and the matching ink for every manifest chain', () => {
  for (const entry of CHAIN_MANIFEST) {
    const family = chainFamilyDisplay(entry.family)
    assert.ok(family !== null)
    const display = chainDisplay(entry.id)
    assert.equal(display.glyph, family.glyph)
    assert.equal(display.color, family.color)
    assert.equal(display.inkColor, CHAIN_GLYPH_INK[display.ink])
  }
})

test('two chains of one family share the badge facts, and differ only in label', () => {
  const mainnet = chainDisplay('eip155:8453')
  const testnet = chainDisplay('eip155:84532')
  assert.equal(mainnet.color, testnet.color)
  assert.equal(mainnet.glyph, testnet.glyph)
  assert.notEqual(mainnet.label, testnet.label)
})

test('an unknown id draws the neutral fallback: Unknown, the fallback glyph, no colour, light ink', () => {
  for (const id of ['eip155:999999', 'bogus', '']) {
    const display = chainDisplay(id)
    assert.equal(display.label, 'Unknown')
    assert.equal(display.glyph, CHAIN_FALLBACK_GLYPH)
    assert.equal(display.color, null)
    assert.equal(display.ink, 'light')
    assert.equal(display.inkColor, CHAIN_GLYPH_INK.light)
  }
})
