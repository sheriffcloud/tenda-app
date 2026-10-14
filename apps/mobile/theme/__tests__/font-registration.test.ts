/**
 * Every font family the theme NAMES must be a face the app REGISTERS.
 *
 * This is the check that did not exist when it was needed. `theme/tokens.ts`
 * declared `mono: 'JetBrainsMono'`; nothing ever loaded it; and because RN
 * answers an unknown `fontFamily` by falling back to the platform sans rather
 * than erroring, ~100 numeric surfaces — gig-card amounts, wallet balances,
 * chat timestamps, countdowns — rendered in Roboto/SF for months while every
 * style in the codebase said JetBrains Mono. Nothing failed, nothing warned,
 * and the fixed-width boxes those numbers sit in were sized for the face that
 * was never there.
 *
 * The tokens are the source of names and `theme/fonts.ts` the source of
 * assets, on purpose: the tokens are imported by nearly everything and must
 * stay free of `require`d .ttf files. This test is the seam between them.
 */
import { typography } from '@/theme/tokens'
import { FONT_ASSETS } from '@/theme/fonts'

/** Every family name reachable under `typography.fonts`, at any depth. */
function declaredFamilies(node: unknown, found: string[] = []): string[] {
  if (typeof node === 'string') found.push(node)
  else if (node !== null && typeof node === 'object') {
    for (const value of Object.values(node)) declaredFamilies(value, found)
  }
  return found
}

test('every family the tokens name is registered', () => {
  const registered = new Set(Object.keys(FONT_ASSETS))
  const missing = [...new Set(declaredFamilies(typography.fonts))].filter(
    (family) => !registered.has(family),
  )

  expect(missing).toEqual([])
})

test('the token tree actually yields families — the check must not pass vacuously', () => {
  // Without this, a `fonts` shape this walker cannot read (or an empty one)
  // would report "nothing missing" and the test above would guard nothing.
  const families = declaredFamilies(typography.fonts)

  expect(families.length).toBeGreaterThanOrEqual(Object.keys(FONT_ASSETS).length)
  expect(families).toContain('JetBrainsMono_600SemiBold')
})

test('no face is registered that nothing names', () => {
  // The other direction. A leftover asset is dead weight in the bundle, and
  // more usefully it is the symptom of a rename that only got done on one side.
  const declared = new Set(declaredFamilies(typography.fonts))
  const unused = Object.keys(FONT_ASSETS).filter((family) => !declared.has(family))

  expect(unused).toEqual([])
})
