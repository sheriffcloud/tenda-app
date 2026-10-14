import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abbreviatedName } from '../../src/utils/parties'

/**
 * The name a stranger sees on an exchange offer (#175). Its failure modes are
 * not crashes: they are a full legal name reaching a public row, or a blank
 * where a person should be. Both are asserted here rather than inferred.
 */
test('abbreviatedName gives the first name and one initial', () => {
  assert.equal(abbreviatedName('Wisdom', 'Abioye'), 'Wisdom A.')
})

test('abbreviatedName never emits the surname itself', () => {
  const out = abbreviatedName('Wisdom', 'Abioye')
  assert.ok(!out.includes('Abioye'), 'the surname must not survive abbreviation')
})

test('abbreviatedName degrades on each nullable column', () => {
  assert.equal(abbreviatedName('Wisdom', null), 'Wisdom')
  assert.equal(abbreviatedName(null, 'Abioye'), 'A.')
  assert.equal(abbreviatedName(null, null), '')
})

/**
 * Whitespace-only is ABSENT, not a name — the bug `formatFullName` next door
 * exists to kill. `filter(Boolean)` keeps `'  '`, which would render as a blank
 * label and silently skip any `|| fallback` after it.
 */
test('abbreviatedName treats whitespace-only columns as absent', () => {
  assert.equal(abbreviatedName('  ', '  '), '')
  assert.equal(abbreviatedName('Wisdom', '   '), 'Wisdom')
  assert.equal(abbreviatedName('   ', 'Abioye'), 'A.')
})

test('abbreviatedName trims around the parts it keeps', () => {
  assert.equal(abbreviatedName('  Wisdom  ', '  Abioye  '), 'Wisdom A.')
})

/**
 * `charAt(0)` would cut an astral character mid-surrogate and render a
 * replacement glyph. A surname outside the BMP is rare but not hypothetical,
 * and the failure would be silent and ugly rather than loud.
 */
test('abbreviatedName takes a whole character, not half a surrogate pair', () => {
  assert.equal(abbreviatedName('Wisdom', '𝒜bioye'), 'Wisdom 𝒜.')
  assert.equal(abbreviatedName('Ada', '𐎠rmin'), 'Ada 𐎠.')
})

test('abbreviatedName handles a single-character surname', () => {
  assert.equal(abbreviatedName('Wisdom', 'A'), 'Wisdom A.')
})
