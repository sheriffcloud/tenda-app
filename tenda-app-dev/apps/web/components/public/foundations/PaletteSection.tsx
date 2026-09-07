/**
 * The palette (Tier 1 comp, lines 770-783), grouped by token family.
 *
 * Each swatch paints itself with `var(--token)` rather than a value read at
 * render time. That is what makes the theme toggle work without a reload —
 * the comp's own claim — and it is also the only honest way to show a token:
 * the swatch IS the custom property, so it cannot show one colour while the
 * app uses another.
 */
import { swatchGroups } from '@/lib/foundations/palette'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { FoundationsSection } from './FoundationsSection'

export function PaletteSection() {
  return (
    <FoundationsSection
      title="Palette"
      intro="Generated from apps/mobile/theme/tokens.ts into styles/tokens.css. Every swatch below is painted by its own custom property, so the theme toggle in the header changes this page in place."
    >
      <div className="flex flex-col gap-8">
        {swatchGroups().map((group) => (
          <div key={group.title}>
            <Eyebrow as="h3" className="mb-3 font-bold">
              {group.title}
            </Eyebrow>
            <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 p-0">
              {group.swatches.map((swatch) => (
                <li
                  key={swatch.name}
                  className="overflow-hidden rounded-md border border-border-subtle bg-surface-card"
                >
                  <div
                    className="h-14 border-b border-border-subtle"
                    style={{ background: `var(${swatch.name})` }}
                  />
                  <p className="break-all px-3 py-2.5 font-numeric text-xs leading-4 text-content-primary">
                    {swatch.name}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </FoundationsSection>
  )
}
