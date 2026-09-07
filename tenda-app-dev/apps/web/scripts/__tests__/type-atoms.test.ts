// @vitest-environment node
/**
 * The type atoms: mobile's typography.styles become one `type-*` utility
 * each, for BOTH targets. What matters: every style resolves to a face ROLE
 * (an unknown face is refused, not guessed), the CSS carries exactly the
 * phone's numbers, mono atoms take tabular figures, the safelist names every
 * atom so the utilities exist without a scan, and both renderers include the
 * block.
 */
import { typography } from '../../../mobile/theme/tokens'
import { render } from '../gen-web-tokens/core'
import { renderTendahq } from '../gen-web-tokens/tendahq'
import {
  fontRoleOf,
  TYPE_CLASS_PREFIX,
  typeAtoms,
  typeBlock,
  typeSourceInline,
  typeUtilities,
} from '../gen-web-tokens/typography'

describe('fontRoleOf', () => {
  it('resolves each face family to its role', () => {
    expect(fontRoleOf(typography.fonts.display.bold)).toBe('display')
    expect(fontRoleOf(typography.fonts.body.regular)).toBe('body')
    expect(fontRoleOf(typography.fonts.mono.semibold)).toBe('mono')
  })

  it('refuses a face the tokens do not name', () => {
    expect(() => fontRoleOf('Inter_400Regular')).toThrow(/"Inter_400Regular" is not a face/)
  })
})

describe('typeAtoms', () => {
  const atoms = typeAtoms()
  const byName = new Map(atoms.map((atom) => [atom.name, atom]))

  it('is one atom per mobile style, in mobile order, kebab-named', () => {
    expect(atoms.map((atom) => atom.name)).toEqual(
      Object.keys(typography.styles).map((key) => key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()),
    )
    expect(byName.has('body-small')).toBe(true)
    expect(byName.has('mono-large')).toBe(true)
  })

  it('carries the phone’s numbers and role, with tracking only where the style sets one', () => {
    // The eyebrow became a style in #59c so the three apps could share it;
    // before that it was four literals inside mobile's Eyebrow component.
    expect(byName.get('eyebrow')).toEqual({
      name: 'eyebrow',
      role: 'mono',
      fontSize: 9.5,
      lineHeight: 12,
      fontWeight: '600',
      letterSpacing: 0.95,
    })
    expect(byName.get('h1')).toEqual({
      name: 'h1',
      role: 'display',
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '700',
      letterSpacing: -0.6,
    })
    expect(byName.get('h3')?.letterSpacing).toBeNull()
    expect(byName.get('mono')?.role).toBe('mono')
    expect(byName.get('label')?.role).toBe('body')
  })
})

describe('typeUtilities', () => {
  const css = typeUtilities()

  it('writes one @utility per atom with the role variable and px values', () => {
    expect(css).toContain(
      '@utility type-h1 {\n  font-family: var(--font-display);\n  font-size: 30px;\n  line-height: 36px;\n  font-weight: 700;\n  letter-spacing: -0.6px;\n}',
    )
    expect(css).toContain(
      '@utility type-h3 {\n  font-family: var(--font-display);\n  font-size: 20px;\n  line-height: 26px;\n  font-weight: 600;\n}',
    )
  })

  it('gives every mono atom tabular figures and no other atom', () => {
    for (const atom of typeAtoms()) {
      const block = css.slice(css.indexOf(`@utility ${TYPE_CLASS_PREFIX}${atom.name} {`))
      const body = block.slice(0, block.indexOf('}'))
      expect(body.includes('font-variant-numeric: tabular-nums;')).toBe(atom.role === 'mono')
    }
  })

  it('safelists every atom as its own plain literal — never a brace list', () => {
    // Measured on the real build: a `type-{hero,h1,…}` brace list compiled the
    // digit-free names and dropped type-h1/h2/h3. One literal per atom.
    const lines = typeSourceInline().split('\n')
    expect(lines).toHaveLength(typeAtoms().length)
    for (const atom of typeAtoms()) {
      expect(lines).toContain(`@source inline("type-${atom.name}");`)
    }
    expect(typeSourceInline()).not.toMatch(/[{},]/)
  })

  it('reaches both targets, safelist first', () => {
    const block = typeBlock()
    expect(block.indexOf('@source inline')).toBeLessThan(block.indexOf('@utility'))
    expect(render()).toContain(block)
    expect(renderTendahq()).toContain(block)
    // top-level in tendahq's sheet: an @utility inside @layer is not compiled
    const tendahq = renderTendahq()
    expect(tendahq.lastIndexOf('}\n}\n')).toBeLessThan(tendahq.indexOf('@utility'))
  })
})
