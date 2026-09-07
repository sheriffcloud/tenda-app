// @vitest-environment node
/**
 * Token generator: the shared core, the web renderer and the tendahq target.
 * The behaviors that matter: light and dark schemes emit the SAME property
 * set in the same order (a token added to one scheme only is exactly the
 * "colour defined in a single theme block" bug — and the tendahq pairing
 * refuses it outright), hex shorthand converts correctly (not just the
 * all-zero '#000'), shadow and motion values match mobile's, the geometry set
 * is one list both targets emit, and every output is deterministic so the CI
 * drift gates compare apples to apples.
 */
import { colors, type ColorScheme } from '../../../mobile/theme/tokens'
import { easingToCss, flattenScheme, geometryPairs, hexToRgb, kebab, OMITTED_GROUPS, render, schemePairs, shadowToCss } from '../gen-web-tokens/core'
import { pairedScheme, renderTendahq } from '../gen-web-tokens/tendahq'

describe('kebab', () => {
  it('splits camelCase and lowercases', () => {
    expect(kebab('backgroundAlt')).toBe('background-alt')
    expect(kebab('inputBackgroundDisabled')).toBe('input-background-disabled')
  })

  it('leaves already-flat keys alone', () => {
    expect(kebab('2xs')).toBe('2xs')
    expect(kebab('card')).toBe('card')
  })
})

describe('hexToRgb', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgb('#2E5BD6')).toEqual([46, 91, 214])
  })

  it('expands 3-digit shorthand instead of misparsing it', () => {
    expect(hexToRgb('#000')).toEqual([0, 0, 0])
    expect(hexToRgb('#abc')).toEqual([170, 187, 204])
  })

  it('rejects unsupported formats loudly', () => {
    expect(() => hexToRgb('#12345')).toThrow(/unsupported hex/)
    expect(() => hexToRgb('rgba(0,0,0,1)')).toThrow(/unsupported hex/)
  })
})

describe('shadowToCss', () => {
  it('collapses RN shadows to the design-brief box-shadow values', () => {
    expect(
      shadowToCss({
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -24 },
        shadowOpacity: 0.1,
        shadowRadius: 48,
      }),
    ).toBe('0px -24px 48px rgba(0,0,0,0.1)')
    expect(
      shadowToCss({
        shadowColor: '#2E5BD6',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
      }),
    ).toBe('0px 10px 24px rgba(46,91,214,0.18)')
  })
})

describe('easingToCss', () => {
  it('writes the four-point tuple as a cubic-bezier', () => {
    expect(easingToCss([0.2, 0, 0, 1])).toBe('cubic-bezier(0.2, 0, 0, 1)')
  })

  it('refuses anything but four control points', () => {
    expect(() => easingToCss([0.2, 0, 0])).toThrow(/expected 4/)
  })
})

describe('geometryPairs', () => {
  const names = new Map(geometryPairs())

  it('carries radius, spacing, shadows and motion, in that order', () => {
    const order = geometryPairs().map(([property]) => property.split('-')[2])
    const first = (prefix: string) => order.indexOf(prefix)
    expect(first('radius')).toBeLessThan(first('space'))
    expect(first('space')).toBeLessThan(first('shadow'))
    expect(first('shadow')).toBeLessThan(first('duration'))
    expect(first('duration')).toBeLessThan(first('easing'))
  })

  it('emits the button radii mobile used to hardcode', () => {
    expect(names.get('--radius-button')).toBe('12px')
    expect(names.get('--radius-button-lg')).toBe('14px')
  })

  it('emits motion as ms and cubic-bezier', () => {
    expect(names.get('--duration-fast')).toBe('150ms')
    expect(names.get('--easing-standard')).toBe('cubic-bezier(0.2, 0, 0, 1)')
    // The spring has no CSS form; it must not leak as "[object Object]".
    for (const [, value] of geometryPairs()) expect(value).not.toContain('object')
  })
})

describe('scheme flattening', () => {
  it('light and dark emit the SAME properties in the SAME order', () => {
    const light = flattenScheme(colors.light).map(([property]) => property)
    const dark = flattenScheme(colors.dark).map(([property]) => property)
    expect(dark).toEqual(light)
    expect(light.length).toBeGreaterThan(0)
  })

  it('flattens nested tones into the appendix naming', () => {
    const names = new Set(flattenScheme(colors.light).map(([property]) => property))
    expect(names.has('--surface-background')).toBe(true)
    expect(names.has('--feedback-danger-text')).toBe(true)
    expect(names.has('--category-errand-surface')).toBe(true)
    expect(names.has('--control-input-background-disabled')).toBe(true)
  })
})

describe('tendahq target', () => {
  const css = renderTendahq()
  const light = flattenScheme(colors.light)

  it('is deterministic', () => {
    expect(renderTendahq()).toBe(css)
  })

  it('pairs every colour token as light-dark(light, dark), in mobile order', () => {
    const dark = new Map(flattenScheme(colors.dark))
    const kept = light.filter(([property]) => !OMITTED_GROUPS.some((g) => property.startsWith(`--${g}-`)))
    expect(pairedScheme()).toEqual(kept.map(([property, value]) => [property, value, dark.get(property)]))
    expect(css).toContain('--surface-background: light-dark(#F7F5F0, #0D1018);')
    expect(css).toContain('--brand-on-primary: light-dark(#FFFFFF, #FFFFFF);')
  })

  it('omits the dead accent group and nothing else', () => {
    expect(OMITTED_GROUPS).toEqual(['accent'])
    expect(css).not.toContain('--accent')
    const omitted = light.filter(([property]) => property.startsWith('--accent-'))
    expect(omitted.length).toBeGreaterThan(0)
    expect(pairedScheme()).toHaveLength(light.length - omitted.length)
  })

  it('refuses a light token with no dark counterpart, and ignores a dark-only one', () => {
    // Spread through a variable: an object literal with an extra key would be
    // an excess-property error, and the point is a leaf the TYPE does not know.
    const surface = { ...colors.light.surface, ghost: '#000000' }
    const lightOnly: ColorScheme = { ...colors.light, surface }
    expect(() => pairedScheme(lightOnly, colors.dark)).toThrow(/--surface-ghost has no dark value/)
    const darkSurface = { ...colors.dark.surface, ghost: '#000000' }
    const darkOnly: ColorScheme = { ...colors.dark, surface: darkSurface }
    expect(pairedScheme(colors.light, darkOnly)).toEqual(pairedScheme())
  })

  it('declares the root once, following the system, inside the base layer', () => {
    expect(css).toContain('@layer base {\n  :root {\n    color-scheme: light dark;')
    expect(css).not.toContain('prefers-color-scheme')
    expect(css).not.toContain('@theme')
  })

  it('carries the same geometry and motion set as web', () => {
    for (const [property, value] of geometryPairs()) {
      expect(css).toContain(`${property}: ${value};`)
    }
  })
})

describe('render', () => {
  const css = render()

  it('is deterministic', () => {
    expect(render()).toBe(css)
  })

  it('emits all three theme blocks with color-scheme hints', () => {
    expect(css).toContain(':root{\n  color-scheme:light;')
    expect(css).toContain('@media (prefers-color-scheme:dark){\n  :root:not([data-theme="light"]){')
    expect(css).toContain(':root[data-theme="dark"]{\n  color-scheme:dark;')
  })

  it('carries known light and dark values from the mobile tokens', () => {
    expect(css).toContain('--surface-background:#F7F5F0')
    expect(css).toContain('--surface-background:#0D1018')
    expect(css).toContain('--radius-card:20px')
    expect(css).toContain('--space-2xs:4px')
    expect(css).toContain('--shadow-sheet:0px -24px 48px rgba(0,0,0,0.1)')
    expect(css).toContain('--duration-normal:220ms')
    expect(css).toContain('--easing-exit:cubic-bezier(0.4, 0, 1, 1)')
  })

  it('maps every colour token it receives into the Tailwind theme block', () => {
    for (const [property] of schemePairs(colors.light)) {
      expect(css).toContain(`--color-${property.slice(2)}:var(${property});`)
    }
  })

  it('omits the dead accent group from every block, like tendahq', () => {
    expect(css).not.toContain('accent')
    expect(schemePairs(colors.light)).toHaveLength(
      flattenScheme(colors.light).length - flattenScheme(colors.light).filter(([p]) => p.startsWith('--accent-')).length,
    )
  })
})
