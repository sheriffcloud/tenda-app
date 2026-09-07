import { SectionShell } from '@/components/ui/SectionShell'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { useIntersect } from '@/hooks/useIntersect'
import { ONBOARDING_FEATURES, ONBOARDING_HEADER } from '@/content'
import { FeatureCard } from './FeatureCard'

/**
 * §05 Onboarding rails — the "you don't need gas money to start" section.
 * Cards get their own reveal container so the
 * four rails stagger up one after another as the grid enters the viewport.
 */
export function Onboarding() {
  const { ref, isVisible } = useIntersect<HTMLDivElement>({ threshold: 0.15 })

  return (
    <SectionShell id="onboarding" surface="base" padY="lg">
      <div className="mb-12 flex max-w-[62ch] flex-col gap-4">
        <Eyebrow tone="brand" dot>
          {ONBOARDING_HEADER.eyebrow}
        </Eyebrow>
        <h2 className="h1 text-[var(--content-primary)]">
          {ONBOARDING_HEADER.h2.lead}{' '}
          <span className="text-[var(--brand)]">{ONBOARDING_HEADER.h2.emphasis}</span>
        </h2>
        <p className="body-lg text-[var(--content-secondary)]">{ONBOARDING_HEADER.sub}</p>
      </div>

      <div
        ref={ref}
        data-visible={isVisible || undefined}
        className="reveal-on-scroll grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        {ONBOARDING_FEATURES.map((feature) => (
          <FeatureCard key={feature.id} feature={feature} />
        ))}
      </div>
    </SectionShell>
  )
}
