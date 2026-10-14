import type { Metadata } from 'next'
import { OnboardingCarousel } from '@/components/onboarding/OnboardingCarousel'
import { ONBOARDING_COPY } from '@/components/onboarding/copy'

export const metadata: Metadata = {
  title: ONBOARDING_COPY.title,
  // Three slides of product explanation with no unique destination of their
  // own — /support is where that content is written to be found. `follow` so
  // the links out of it still count.
  robots: { index: false, follow: true },
}

/**
 * The value-prop carousel (Auth comp, lines 409-436). Server shell only; the
 * slide state is client-side, in the carousel.
 */
export default function OnboardingPage() {
  return <OnboardingCarousel />
}
