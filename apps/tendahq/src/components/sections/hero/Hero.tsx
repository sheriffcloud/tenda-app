import { Download } from 'lucide-react'
import { SectionShell } from '@/components/ui/SectionShell'
import { Pill } from '@/components/ui/Pill'
import { Button } from '@/components/ui/Button'
import { LiveDot } from '@/components/ui/LiveDot'
import { ChainBadges } from '@/components/product/ChainBadges'
import { HERO_CONTENT } from './content'
import { HeroStatRow } from './HeroStatRow'
import { TaskDeck } from './TaskDeck'

/**
 * Hero anatomy:
 *
 *   - Background: two blue radial glows (deep behind the deck, soft
 *     lower-left) + a 32px scanline grid for trading-desk feel.
 *   - Left column:  pills · h1 (gradient emphasis on line 3) · ribbon copy ·
 *                   stat row · dual CTA · chain badges.
 *   - Right column: TaskDeck — example gigs swiping up through a card stack.
 */
export function Hero() {
  return (
    <SectionShell
      surface="base"
      padY="lg"
      noReveal
      className="overflow-hidden pt-32 md:pt-40"
    >
      <HeroBackground />

      <div className="relative z-10 grid items-center gap-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
        <div className="flex flex-col gap-8">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="neutral" size="md">
              {HERO_CONTENT.stamps.versionLabel}
            </Pill>
            <Pill tone="live" size="md">
              <LiveDot size={6} className="mr-1" />
              {HERO_CONTENT.stamps.liveLabel}
            </Pill>
          </div>

          <h1 className="h-hero text-[var(--content-primary)]">
            {HERO_CONTENT.h1.line1}
            <br />
            {HERO_CONTENT.h1.line2}
            <br />
            <em className="not-italic text-brand-gradient">{HERO_CONTENT.h1.line3}</em>
          </h1>

          <div className="flex max-w-[58ch] flex-col gap-3">
            <p className="body-lg text-[var(--content-secondary)]">
              {HERO_CONTENT.ribbon[0]}
            </p>
            <span
              aria-hidden
              className="block h-px w-12"
              style={{
                background:
                  'linear-gradient(90deg, color-mix(in oklab, var(--brand) 60%, transparent), transparent)',
              }}
            />
            <p className="body-lg font-semibold text-[var(--content-primary)]">
              {HERO_CONTENT.ribbon[1]}
            </p>
          </div>

          <HeroStatRow />

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button href="/#download" variant="primary" size="xl">
                <Download className="h-5 w-5" />
                {HERO_CONTENT.cta.primary}
              </Button>
            </div>
            <ChainBadges />
          </div>
        </div>

        <TaskDeck />
      </div>
    </SectionShell>
  )
}

function HeroBackground() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            'linear-gradient(color-mix(in oklab, var(--content-primary) 2%, transparent) 1px, transparent 1px)',
          backgroundSize: '100% 32px',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(circle at 78% 34%, color-mix(in oklab, var(--brand) 13%, transparent), transparent 55%), radial-gradient(circle at 14% 70%, color-mix(in oklab, var(--accent) 8%, transparent), transparent 50%)',
        }}
      />
    </>
  )
}
