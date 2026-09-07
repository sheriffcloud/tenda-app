/**
 * Chain family display — the brand facts every client's chain badge draws,
 * moved here from tendahq (#60). Asserted against the real manifest.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHAIN_FALLBACK_GLYPH,
  CHAIN_GLYPH_INK,
  chainFamilyDisplay,
  chainGlyphInk,
} from '../../src/chains/display'
import { CHAIN_MANIFEST } from '../../src/chains/manifest'

test('every manifest family has a display row with a six-digit brand hex and a glyph', () => {
  for (const family of new Set(CHAIN_MANIFEST.map((entry) => entry.family))) {
    const display = chainFamilyDisplay(family)
    assert.ok(display !== null, `no display row for family "${family}"`)
    assert.match(display.color, /^#[0-9A-F]{6}$/i)
    assert.equal([...display.glyph].length, 1)
    assert.notEqual(display.name, '')
  }
})

test('marketing case wins over the manifest display name', () => {
  assert.equal(chainFamilyDisplay('base')?.name, 'Base')
  assert.equal(chainFamilyDisplay('0g')?.name, '0G')
})

test('an unknown family answers null, never a guess', () => {
  assert.equal(chainFamilyDisplay('not-a-family'), null)
  assert.equal(chainFamilyDisplay(''), null)
})

test('inherited Object.prototype keys are not families', () => {
  assert.equal(chainFamilyDisplay('constructor'), null)
  assert.equal(chainFamilyDisplay('toString'), null)
  assert.equal(chainFamilyDisplay('__proto__'), null)
})

test('the glyph ink is the higher-contrast of the two fixed inks', () => {
  // Yellow and 0G's violet take the dark ink; Solana's purple and Base's blue
  // the light one — what a 50% luminance cut gets wrong for 0G (white would
  // sit at 2.6:1 where the dark ink reaches 7.2:1).
  assert.equal(chainGlyphInk('#FCFF52'), 'dark')
  assert.equal(chainGlyphInk('#C681FF'), 'dark')
  assert.equal(chainGlyphInk('#9945FF'), 'light')
  assert.equal(chainGlyphInk('#0052FF'), 'light')
  assert.equal(chainGlyphInk('#FFFFFF'), 'dark')
  assert.equal(chainGlyphInk('#000000'), 'light')
})

test('a colour that is not a hex — a CSS variable, garbage — takes the light ink', () => {
  assert.equal(chainGlyphInk('var(--brand-primary)'), 'light')
  assert.equal(chainGlyphInk('#FFF'), 'light')
  assert.equal(chainGlyphInk(''), 'light')
})

test('the fixed inks and the fallback glyph are what the badge expects', () => {
  assert.match(CHAIN_GLYPH_INK.dark, /^#[0-9A-F]{6}$/i)
  assert.match(CHAIN_GLYPH_INK.light, /^#[0-9A-F]{6}$/i)
  assert.equal([...CHAIN_FALLBACK_GLYPH].length, 1)
})
