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
// `vi` alone is IMPORTED. `describe`/`it`/`expect` resolve as ambient globals
// in this package, `vi` does not — so the six `vi.spyOn` calls below compiled
// nowhere and `pnpm --filter web type-check` was red with TS2304.
import { vi } from 'vitest'
import { buttonGeometry, colors, type ColorScheme } from '../../../mobile/theme/tokens'
import { easingToCss, flattenScheme, geometryPairs, hexToRgb, kebab, render, schemePairs, shadowToCss } from '../gen-web-tokens/core'
import { pairedScheme, renderTendahq } from '../gen-web-tokens/tendahq'
import { TARGETS, targetFromArgv } from '../gen-web-tokens/targets'

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

  it('emits mobile’s button geometry for every size, and the fixed ghost height', () => {
    for (const size of ['sm', 'md', 'lg', 'xl'] as const) {
      expect(names.get(`--button-h-${size}`)).toBe(`${buttonGeometry.height[size]}px`)
      expect(names.get(`--button-px-${size}`)).toBe(`${buttonGeometry.padX[size]}px`)
      expect(names.get(`--button-text-${size}`)).toBe(`${buttonGeometry.label[size].fontSize}px`)
      expect(names.get(`--button-leading-${size}`)).toBe(`${buttonGeometry.label[size].lineHeight}px`)
    }
    expect(names.get('--button-h-ghost')).toBe('44px')
    // The values web and the phone agreed on in the decision that tokenised
    // them: side padding 18/22 (not web's old 20/24), ghost 44.
    expect([names.get('--button-px-md'), names.get('--button-px-lg')]).toEqual(['18px', '22px'])
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
  const css = renderTendahq('pnpm --filter tendahq gen:tokens')
  const light = flattenScheme(colors.light)

  it('is deterministic', () => {
    expect(renderTendahq('pnpm --filter tendahq gen:tokens')).toBe(css)
  })

  it('pairs every colour token as light-dark(light, dark), in mobile order', () => {
    const dark = new Map(flattenScheme(colors.dark))
    expect(pairedScheme()).toEqual(light.map(([property, value]) => [property, value, dark.get(property)]))
    expect(css).toContain('--surface-background: light-dark(#F7F5F0, #0D1018);')
    expect(css).toContain('--brand-on-primary: light-dark(#FFFFFF, #FFFFFF);')
  })

  it('carries no accent group: the amber was retired from mobile and never reaches a page', () => {
    expect(css).not.toContain('--accent')
    expect(light.some(([property]) => property.startsWith('--accent-'))).toBe(false)
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

const WEB_REGEN = 'pnpm --filter web gen:tokens'

describe('render', () => {
  const css = render(WEB_REGEN)

  it('is deterministic', () => {
    expect(render(WEB_REGEN)).toBe(css)
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

describe('the target map', () => {
  it('declares the three outputs the repo generates', () => {
    expect(Object.keys(TARGETS).sort()).toEqual(['docs', 'tendahq', 'web'])
  })

  it('stamps each file with the command that rewrites THAT file', () => {
    // The drift gate compares a fresh render against the file on disk, so a
    // header naming another app's command is written consistently and passes
    // the gate for ever. Nothing else would catch it — which is why the
    // command is declared once per target and read from there.
    for (const [name, target] of Object.entries(TARGETS)) {
      // `name` is in the loop so a failure's diff shows which target it was.
      const header = `${name}\n${target.render(target.regen).split('\n').slice(0, 3).join('\n')}`
      expect(header).toContain(`Regenerate: ${target.regen}`)
      expect(header).toContain(`CI guard:   ${target.regen}:check`)
    }
  })

  it('DERIVES that header rather than carrying its own copy of the command', () => {
    // The case above passes just as well against a renderer that hardcodes the
    // string its target happens to declare — which is what web's did. Handing
    // in a command no target uses is what separates the two: a header that
    // still names a real app is a copy, and a copy is what drifts.
    const sentinel = 'pnpm --filter nothing-at-all gen:tokens'
    for (const [name, target] of Object.entries(TARGETS)) {
      const header = `${name}\n${target.render(sentinel).split('\n').slice(0, 3).join('\n')}`
      expect(header).toContain(`Regenerate: ${sentinel}`)
    }
  })

  it('writes every target to a different file', () => {
    const outputs = Object.values(TARGETS).map((target) => target.out)
    expect(new Set(outputs).size).toBe(outputs.length)
  })

  it('gives the docs site the landing’s renderer, byte for byte apart from the header', () => {
    // Same palette, same shape — the only difference a reader should find
    // between the two files is which command regenerates it.
    const landing = TARGETS.tendahq.render('X')
    const docs = TARGETS.docs.render('X')
    expect(docs).toBe(landing)
  })
})

describe('targetFromArgv', () => {
  it('defaults to web — the original output, and what a bare `gen:tokens` means', () => {
    expect(targetFromArgv([])).toBe(TARGETS.web)
    expect(targetFromArgv(['node', 'main.ts', '--check'])).toBe(TARGETS.web)
  })

  it('takes the target named after --target, wherever it sits in argv', () => {
    expect(targetFromArgv(['--target', 'docs'])).toBe(TARGETS.docs)
    expect(targetFromArgv(['node', 'main.ts', '--target', 'tendahq', '--check'])).toBe(TARGETS.tendahq)
  })

  it('exits 2 on a name nothing declares, rather than writing somewhere unintended', () => {
    // A typo'd target must not silently fall back to web and overwrite its
    // tokens — the failure mode this exit code exists for.
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit')
    }) as never)
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      expect(() => targetFromArgv(['--target', 'landing'])).toThrow('exit')
      expect(exit).toHaveBeenCalledWith(2)
      expect(String(err.mock.calls[0]?.[0])).toContain('unknown --target "landing"')
      // And --target with nothing after it is the same refusal, not a default.
      expect(() => targetFromArgv(['--target'])).toThrow('exit')
    } finally {
      exit.mockRestore()
      err.mockRestore()
    }
  })

  it('refuses a PROTOTYPE key — `toString` is not a target', () => {
    // The repo's named hazard, on a CLI flag: `'toString' in TARGETS` is true,
    // so a membership test would pass the guard and hand the writer
    // `Object.prototype.toString` — a function it would then call `.render()`
    // on. `Object.hasOwn` is what makes `--target toString` a refusal.
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit')
    }) as never)
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      for (const inherited of ['toString', 'constructor', 'valueOf', 'hasOwnProperty']) {
        expect(() => targetFromArgv(['--target', inherited])).toThrow('exit')
      }
      expect(exit).toHaveBeenCalledTimes(4)
    } finally {
      exit.mockRestore()
      err.mockRestore()
    }
  })

  it('names the legal targets in its error, so the fix is in the message', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit')
    }) as never)
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      expect(() => targetFromArgv(['--target', 'nope'])).toThrow('exit')
      for (const name of Object.keys(TARGETS)) {
        expect(String(err.mock.calls[0]?.[0])).toContain(name)
      }
    } finally {
      exit.mockRestore()
      err.mockRestore()
    }
  })
})
