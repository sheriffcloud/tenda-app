import { Fragment } from 'react'
import { SectionShell, type LandingSectionProps } from '@/components/ui/SectionShell'
import { Period, SectionHead, SectionRule } from '@/components/ui/SectionRule'
import { Sheet } from '@/components/ui/Sheet'
import { PRODUCT_PANELS, TWO_PRODUCTS_BRIDGE, TWO_PRODUCTS_HEADER } from './content'
import { ProductPanel } from './ProductPanel'

/**
 * §03 Two products — ONE sheet, split by a hairline, closed by a spine.
 *
 * Gigs and Exchange keep their separate names but not their geometry: they
 * were two free-standing cards, which said "two products" a second time in a
 * way the section is arguing against. The spine underneath — same wallet,
 * same escrow, one app — runs THROUGH the surface, inside the thing they
 * share, which is the sentence's entire claim.
 */
export function TwoProducts({ surface }: LandingSectionProps) {
  const [line1, line2] = TWO_PRODUCTS_HEADER.h2
  return (
    <SectionShell id="products" surface={surface}>
      <SectionRule title={TWO_PRODUCTS_HEADER.eyebrow} aside={TWO_PRODUCTS_HEADER.aside} />
      <SectionHead lede={TWO_PRODUCTS_HEADER.sub}>
        {line1}
        <br />
        {line2}<Period />
      </SectionHead>

      <Sheet className="mt-[clamp(28px,3.6vw,44px)]">
        <div className="grid lg:grid-cols-2">
          {PRODUCT_PANELS.map((panel, i) => (
            <ProductPanel
              key={panel.id}
              panel={panel}
              className={
                i === 0
                  ? 'border-b border-[var(--border-default)] lg:border-b-0 lg:border-r'
                  : undefined
              }
            />
          ))}
        </div>

        <div className="flex items-center gap-[18px] border-t border-[var(--border-default)] bg-[var(--surface-background-alt)] px-[clamp(26px,3.2vw,38px)] py-[18px]">
          {TWO_PRODUCTS_BRIDGE.map((word, i) => (
            <Fragment key={word}>
              {i !== 0 && <span aria-hidden className="h-px min-w-3 flex-1 bg-[var(--border-default)]" />}
              <span className="whitespace-nowrap font-[var(--font-display)] text-[15px] font-semibold tracking-[-0.01em] text-[var(--content-primary)]">
                {word}
                {i === TWO_PRODUCTS_BRIDGE.length - 1 && <Period />}
              </span>
            </Fragment>
          ))}
        </div>
      </Sheet>
    </SectionShell>
  )
}
