/**
 * /foundations. The property that makes this page worth having: nothing on it
 * is hand-listed, so it cannot claim a token or a variant the app does not
 * ship.
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { colors } from '../../../../../mobile/theme/tokens'
import { flattenScheme, schemePairs } from '@/scripts/gen-web-tokens/core'
import { typeAtoms } from '@/scripts/gen-web-tokens/typography'
import { swatchGroups } from '@/lib/foundations/palette'
import { typeSpec } from '@/components/public/foundations/TypeScaleSection'
import { FoundationsSection } from '@/components/public/foundations/FoundationsSection'
import { PaletteSection } from '@/components/public/foundations/PaletteSection'
import { PrimitiveStates } from '@/components/public/foundations/PrimitiveStates'
import { TypeScaleSection } from '@/components/public/foundations/TypeScaleSection'

describe('swatchGroups', () => {
  it('invents nothing — every swatch is a token the generator writes', () => {
    // Asserted as a SUBSET rather than by re-running the page's own colour
    // predicate, which would only prove the predicate equals itself.
    const generated = new Set(schemePairs(colors.light).map(([name]) => name))
    const shown = swatchGroups().flatMap((group) => group.swatches.map((s) => s.name))
    expect(shown.length).toBeGreaterThan(0)
    for (const name of shown) expect(generated.has(name)).toBe(true)
  })

  it('shows no swatch for a group the generator omits — a blank square is a lie', () => {
    // The accent group is in the scheme and NOT in the sheet (#59e); listing
    // it painted three squares with properties nothing defines — measured.
    const omitted = flattenScheme(colors.light).filter(([name]) => name.startsWith('--accent-'))
    expect(omitted.length).toBeGreaterThan(0)
    const shown = new Set(swatchGroups().flatMap((group) => group.swatches.map((s) => s.name)))
    for (const [name] of omitted) expect(shown.has(name)).toBe(false)
    expect(swatchGroups().map((group) => group.title)).not.toContain('accent')
  })

  it('drops no hex token — the palette proper is shown in full', () => {
    // A token added to mobile's theme appears here without an edit, and one
    // removed disappears.
    const hex = schemePairs(colors.light)
      .filter(([, value]) => value.startsWith('#'))
      .map(([name]) => name)
    const shown = new Set(swatchGroups().flatMap((group) => group.swatches.map((s) => s.name)))
    expect(hex.length).toBeGreaterThan(50)
    for (const name of hex) expect(shown.has(name)).toBe(true)
  })

  it('groups by token family, keeping the scheme’s own order', () => {
    const titles = swatchGroups().map((group) => group.title)
    expect(titles[0]).toBe('surface')
    expect(titles).toContain('brand')
    expect(titles).toContain('feedback')
    // No family appears twice — that would mean the grouping lost its place.
    expect(new Set(titles).size).toBe(titles.length)
  })
})

describe('PaletteSection', () => {
  it('paints each swatch with its own custom property, never a copied value', () => {
    // A literal hex here would be a value that can silently stop matching the
    // stylesheet; `var()` cannot.
    // Filtered rather than selected: jsdom's selector engine does not match a
    // substring containing "(", so `[style*="var("]` silently answers zero and
    // this assertion would pass for the wrong reason. Verified with a probe.
    const { container } = render(<PaletteSection />)
    const styles = Array.from(container.querySelectorAll('[style]')).map((el) =>
      el.getAttribute('style'),
    )
    const total = swatchGroups().reduce((n, g) => n + g.swatches.length, 0)
    expect(styles).toHaveLength(total)
    for (const style of styles) expect(style).toMatch(/^background: var\(--[a-z0-9-]+\);?$/)
  })

  it('names every token it shows', () => {
    render(<PaletteSection />)
    expect(screen.getByText('--brand-primary')).toBeInTheDocument()
    expect(screen.getByText('--surface-card')).toBeInTheDocument()
  })
})

describe('TypeScaleSection', () => {
  it('shows one row per generated atom, labelled with the spec a reader can grep for', () => {
    render(<TypeScaleSection />)
    // The hero: role, size/line-height, tracking, exactly as tokens.ts states it.
    expect(screen.getByText('display 44/50 -1.2')).toBeInTheDocument()
    // No tracking on h3 → no trailing figure.
    expect(screen.getByText('display 20/26')).toBeInTheDocument()
    for (const atom of typeAtoms()) {
      expect(screen.getByText(typeSpec(atom)).nextElementSibling?.className).toContain(`type-${atom.name}`)
    }
  })

  it('renders a style it has no sample for under its own name, never blank', () => {
    // A style added on the phone reaches this page on the next regenerate
    // before anyone writes a sample for it; the row must still say what it is.
    const atom = { name: 'subtitle', role: 'body' as const, fontSize: 14, lineHeight: 20, fontWeight: '500', letterSpacing: null }
    render(<TypeScaleSection atoms={[atom]} />)
    expect(screen.getByText('body 14/20').nextElementSibling).toHaveTextContent('subtitle')
  })

  it('invents no size — every row is a style the generator emits', () => {
    render(<TypeScaleSection />)
    // `[\d.]+`: the eyebrow is 9.5px, the one non-integer size on the scale.
    const rows = screen.getAllByText(/^(display|body|mono) [\d.]+\/\d+/)
    expect(rows).toHaveLength(typeAtoms().length)
  })
})

describe('PrimitiveStates', () => {
  it('renders the SHIPPED components, so a regression shows up here', () => {
    render(<PrimitiveStates />)
    expect(screen.getByRole('button', { name: 'Primary' })).toBeInTheDocument()
    // The full #44 vocabulary — a variant added and never shown here would be
    // exactly the drift this page exists to make visible.
    expect(screen.getByRole('button', { name: 'Secondary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Outline' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Destructive' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Danger outline' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disabled button' })).toBeDisabled()
  })

  it('shows every badge variant the vocabulary defines', () => {
    render(<PrimitiveStates />)
    for (const variant of ['success', 'warning', 'danger', 'info', 'brand', 'accent', 'neutral']) {
      expect(screen.getByText(variant)).toBeInTheDocument()
    }
  })

  it('shows a field in its default, error and disabled states', () => {
    render(<PrimitiveStates />)
    expect(screen.getByLabelText('Default')).toBeEnabled()
    expect(screen.getByText('No such city in Nigeria.')).toBeInTheDocument()
    expect(screen.getByLabelText('Disabled field')).toBeDisabled()
  })

  it('gives every control a DISTINCT accessible name', () => {
    // The page that demonstrates the design system should not itself ship two
    // controls a screen-reader user cannot tell apart — which it did, with a
    // button and a chip both called "Disabled".
    render(<PrimitiveStates />)
    const names = screen
      .getAllByRole('button')
      .map((el) => el.textContent?.trim() ?? el.getAttribute('aria-label') ?? '')
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('FoundationsSection', () => {
  it('publishes its title as a level-2 heading', () => {
    render(
      <FoundationsSection title="Palette">
        <p>body</p>
      </FoundationsSection>,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Palette' })).toBeInTheDocument()
  })

  it('omits the intro paragraph entirely when there is none', () => {
    const { container } = render(
      <FoundationsSection title="Type scale">
        <p>body</p>
      </FoundationsSection>,
    )
    expect(within(container).getAllByText(/body/)).toHaveLength(1)
    expect(container.querySelectorAll('p')).toHaveLength(1)
  })
})

describe('PrimitiveStates — the controls are LIVE', () => {
  it('the chip pair flips together, so the selected state is demonstrable', async () => {
    // The comp asks for controls you can click. A pair rendered in fixed
    // states would look identical and prove nothing.
    const user = userEvent.setup()
    render(<PrimitiveStates />)
    expect(screen.getByRole('button', { name: 'Selected' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Selected' }))
    expect(screen.getByRole('button', { name: 'Selected' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: 'Unselected' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('the toggle actually toggles', async () => {
    const user = userEvent.setup()
    render(<PrimitiveStates />)
    const toggle = screen.getByRole('switch', { name: 'Example toggle' })
    expect(toggle).toBeChecked()
    await user.click(toggle)
    expect(toggle).not.toBeChecked()
  })

  it('the disabled controls stay put when clicked', async () => {
    const user = userEvent.setup()
    render(<PrimitiveStates />)
    const chip = screen.getByRole('button', { name: 'Disabled chip' })
    await user.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('switch', { name: 'Disabled toggle' })).not.toBeChecked()
  })
})
