import type { Metadata } from 'next'
import { Eyebrow } from '@/components/ui'
import { FoundationsSection } from '@/components/public/foundations/FoundationsSection'
import { PaletteSection } from '@/components/public/foundations/PaletteSection'
import { PrimitiveStates } from '@/components/public/foundations/PrimitiveStates'
import { TypeScaleSection } from '@/components/public/foundations/TypeScaleSection'

/**
 * `noindex` on purpose. This is a team reference, not a page anyone should
 * reach from a search for gig work — and its content (token names, component
 * variants) would rank for queries that have nothing to do with the product.
 * `follow` stays on so the links out of it still count.
 *
 * It is deliberately NOT in the public header either. The comp puts
 * "Foundations" in the primary nav, but the comp is a prototype whose chrome
 * also carries a dev state-switcher and a "404 example" link — affordances for
 * whoever is reviewing the mock, not for someone looking for work. A consumer
 * clicking it lands on a swatch grid. Reachable by URL, documented in
 * CLAUDE.md, absent from the nav: spec-correction #21.
 */
export const metadata: Metadata = {
  title: 'Foundations',
  description: 'Design tokens, type scale and primitive states.',
  robots: { index: false, follow: true },
  alternates: { canonical: '/foundations' },
}

export default function FoundationsPage() {
  return (
    <div className="mx-auto w-full max-w-content px-6 pb-24 pt-14">
      <Eyebrow className="mb-4">Foundations</Eyebrow>
      <h1 className="text-balance font-display text-[32px] font-bold leading-[38px] tracking-[-1.2px] text-content-primary sm:text-[44px] sm:leading-[50px]">
        Tokens, scale and primitive states
      </h1>
      <p className="mt-5 max-w-[64ch] text-[17px] leading-7 text-content-secondary">
        Everything here is read from what the app ships. Colours are the custom
        properties in <code className="type-mono">styles/tokens.css</code>,
        generated from <code className="type-mono">apps/mobile/theme/tokens.ts</code>;
        the controls are the components themselves. Toggle the theme in the header
        and this page follows without a reload.
      </p>

      <PaletteSection />
      <TypeScaleSection />
      <PrimitiveStates />

      <FoundationsSection title="What this page is for">
        <p className="max-w-[66ch] type-body text-content-secondary">
          A visual companion to the drift gate. CI already fails when{' '}
          <code className="font-numeric">styles/tokens.css</code> stops matching its
          generator; this is where you see whether the values still look right
          together, and whether a primitive has quietly grown a state nobody
          designed. Nothing on this page is hand-listed, so nothing on it can go
          stale without the app going stale with it.
        </p>
      </FoundationsSection>
    </div>
  )
}
