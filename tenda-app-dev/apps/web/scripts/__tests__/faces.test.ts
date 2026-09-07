// @vitest-environment node
/**
 * The face boundary: app/layout.tsx loads, through next/font, exactly the
 * three families mobile's tokens name, and globals.css binds each role to
 * that font's variable. This is the drift guard for the day mobile changes a
 * face — the layout is hand-written, so nothing else would notice.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { typography } from '../../../mobile/theme/tokens'
import { facePrefix, nextFontFor } from '../gen-web-tokens/faces'
import type { FontRole } from '../gen-web-tokens/typography'

const ROOT = join(__dirname, '../..')
const layout = readFileSync(join(ROOT, 'app/layout.tsx'), 'utf8')
const globals = readFileSync(join(ROOT, 'app/globals.css'), 'utf8')
const ROLES: readonly FontRole[] = ['display', 'body', 'mono']

describe('facePrefix', () => {
  it('is the family half of a per-weight face key', () => {
    expect(facePrefix('SpaceGrotesk_700Bold')).toBe('SpaceGrotesk')
    expect(facePrefix('JetBrainsMono_500Medium')).toBe('JetBrainsMono')
  })
})

describe('nextFontFor', () => {
  it('names the next/font export and variable for each role', () => {
    expect(nextFontFor('display')).toEqual({ exportName: 'Space_Grotesk', variable: '--font-space-grotesk' })
    expect(nextFontFor('body')).toEqual({ exportName: 'Manrope', variable: '--font-manrope' })
    expect(nextFontFor('mono')).toEqual({ exportName: 'JetBrains_Mono', variable: '--font-jetbrains-mono' })
  })

  it('refuses a role whose faces come from two families', () => {
    const mixed = { ...typography.fonts, display: { ...typography.fonts.display, bold: 'Outfit_700Bold' } }
    expect(() => nextFontFor('display', mixed)).toThrow(/role "display" mixes families \(SpaceGrotesk, Outfit\)/)
  })

  it('refuses a family no next/font export is mapped for, naming the table to extend', () => {
    const unmapped = { ...typography.fonts, body: { regular: 'Inter_400Regular' } }
    expect(() => nextFontFor('body', unmapped)).toThrow(/no next\/font export is mapped for "Inter"/)
  })
})

describe('app/layout.tsx', () => {
  it('imports exactly the three exports the tokens resolve to', () => {
    const match = layout.match(/import \{([^}]+)\} from 'next\/font\/google'/)
    expect(match).not.toBeNull()
    const imported = (match?.[1] ?? '').split(',').map((name) => name.trim()).sort()
    expect(imported).toEqual(ROLES.map((role) => nextFontFor(role).exportName).sort())
  })

  it('publishes each font under the variable globals.css reads', () => {
    for (const role of ROLES) {
      const { variable } = nextFontFor(role)
      expect(layout).toContain(`variable: '${variable}'`)
      expect(globals).toContain(`--font-${role}: var(${variable});`)
    }
  })

  it('pins no weights — mobile registers up to 800 and the atoms set 400–700', () => {
    // A `weight: [...]` pin below a weight the app sets leaves the browser to
    // synthesise it (faux bold on every bold figure, measured before #59).
    // Every face is a variable font; loading the whole axis costs one file.
    expect(layout).not.toMatch(/\bweight:/)
  })

  it('calls no font loader the tokens do not name', () => {
    // The loader CALLS, not the prose: the comments may name the faces that
    // left. Every `Name({ variable:` in the file must be one of the three.
    const loaders = [...layout.matchAll(/\b([A-Z][A-Za-z_]+)\(\{\s*variable:/g)].map((m) => m[1]).sort()
    expect(loaders).toEqual(ROLES.map((role) => nextFontFor(role).exportName).sort())
  })
})
