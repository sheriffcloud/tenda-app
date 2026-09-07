'use client'

/**
 * The value-prop carousel (Auth comp, lines 409-436): art panel, mono counter,
 * headline, body, dots, Skip, Next.
 *
 * The slide is a `<section>` with `aria-live="polite"` and its own heading, so
 * advancing announces the new slide rather than silently repainting — the
 * whole screen is one region whose content swaps, which is the case
 * `aria-live` exists for. Skip and the last slide's control both land on
 * /welcome, so the carousel is never a place you can get stuck.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eyebrow } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import { OnboardingDots } from './OnboardingDots'
import { ONBOARDING_COPY, ONBOARDING_SLIDES } from './copy'

/** Where the carousel lets go — the screen that offers both ways in. */
const EXIT = '/welcome'

export function OnboardingCarousel() {
  const router = useRouter()
  const [index, setIndex] = useState(0)

  const slide = ONBOARDING_SLIDES[index]
  const last = index === ONBOARDING_SLIDES.length - 1
  const Art = slide.icon

  return (
    <section
      aria-label={ONBOARDING_COPY.title}
      className="w-full max-w-[460px] overflow-hidden rounded-card border border-border-subtle bg-surface-card shadow-card"
    >
      <div className="flex h-[180px] items-center justify-center bg-surface-inset">
        <Art size={56} strokeWidth={1.5} aria-hidden className="text-brand-primary" />
      </div>

      <div className="p-7">
        {/* One live region around the parts that change, so a reader hears the
            new slide once rather than hearing the counter and the headline
            announced as two unrelated updates. */}
        <div aria-live="polite">
          <Eyebrow strong>{ONBOARDING_COPY.counter(index, ONBOARDING_SLIDES.length)}</Eyebrow>
          <h1 className="mt-3.5 text-balance type-h1 text-content-primary">
            {slide.title}
          </h1>
          <p className="mt-3 text-[17px] leading-[26px] text-content-secondary">{slide.body}</p>
        </div>

        <div className="mt-7 flex items-center gap-2">
          <OnboardingDots slides={ONBOARDING_SLIDES} index={index} onSelect={setIndex} />
          <span className="flex-1" />
          {/* Absent on the last slide, where the primary control already
              leaves — two controls doing the same thing side by side. */}
          {!last && (
            <Button variant="ghost" size="md" onClick={() => router.push(EXIT)}>
              {ONBOARDING_COPY.skip}
            </Button>
          )}
          <Button
            onClick={() => (last ? router.push(EXIT) : setIndex((i) => i + 1))}
          >
            {last ? ONBOARDING_COPY.done : ONBOARDING_COPY.next}
          </Button>
        </div>
      </div>
    </section>
  )
}
