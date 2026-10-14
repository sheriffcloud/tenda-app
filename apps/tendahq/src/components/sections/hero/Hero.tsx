import { ArrowRight, Download } from 'lucide-react'
import { WEB_APP_LINK } from '@/components/layout/nav-content'
import { SectionShell, type LandingSectionProps } from '@/components/ui/SectionShell'
import { Period } from '@/components/ui/SectionRule'
import { Pill } from '@/components/ui/Pill'
import { Button } from '@/components/ui/Button'
import { HERO_CONTENT } from './content'
import { HeroStatRow } from './HeroStatRow'
import { EscrowReceipt } from './EscrowReceipt'

/**
 * Hero anatomy — the Receipt direction:
 *
 *   - No background treatment. The page ground is the paper; there are no
 *     blooms, scanlines or gradients anywhere on the page (rule 1 of the
 *     design direction: one lit object, and this direction has none).
 *   - Left column:  stamps · h1 ending on the blue period · ONE lede ·
 *                   two CTAs, one of them filled.
 *   - Right column: EscrowReceipt — one example escrow as a receipt.
 *   - Below both:   the four ruled figures, full width.
 */
export function Hero({ surface }: LandingSectionProps) {
  return (
    <SectionShell id="top" surface={surface} padY="none" className="pb-[clamp(40px,5vw,72px)] pt-[clamp(48px,6.4vw,88px)]">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-[clamp(28px,5vw,72px)]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill>{HERO_CONTENT.stamps.versionLabel}</Pill>
            <Pill tone="brand" dot pulse>
              {HERO_CONTENT.stamps.liveLabel}
            </Pill>
          </div>

          <h1 className="h-hero mt-[26px] max-w-[12ch] text-[var(--content-primary)]">
            {HERO_CONTENT.h1}
            <Period />
          </h1>

          <p className="body-lg mt-[22px] max-w-[58ch] text-[var(--content-secondary)]">
            {HERO_CONTENT.lede}
          </p>

          <div className="mt-[30px] flex flex-wrap items-center gap-[11px]">
            <Button href={WEB_APP_LINK.href} variant="primary" size="lg">
              {WEB_APP_LINK.label}
              <ArrowRight className="h-[17px] w-[17px]" />
            </Button>
            <Button href="/#download" variant="outline" size="lg">
              <Download className="h-[17px] w-[17px]" />
              {HERO_CONTENT.cta.secondary}
            </Button>
          </div>
        </div>

        <EscrowReceipt />
      </div>

      <HeroStatRow />
    </SectionShell>
  )
}
