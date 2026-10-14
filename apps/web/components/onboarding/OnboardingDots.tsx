'use client'

/**
 * The carousel's position control (Auth comp, lines 425-429).
 *
 * Buttons rather than decorative pips, because the comp wires `onClick` to
 * each one and a reader who wants slide three should not have to press Next
 * twice. Each carries the TITLE of the slide it goes to — a row of "button,
 * button, button" is what a dot strip usually reaches a screen reader as.
 */
import { ONBOARDING_COPY, type OnboardingSlide } from './copy'
import { cn } from '@/lib/cn'

export function OnboardingDots({
  slides,
  index,
  onSelect,
}: {
  slides: readonly OnboardingSlide[]
  index: number
  onSelect: (index: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      {slides.map((slide, i) => {
        const current = i === index
        return (
          <button
            key={slide.title}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={ONBOARDING_COPY.dot(i, slide.title)}
            aria-current={current ? 'step' : undefined}
            className={cn(
              'h-2 rounded-full transition-all',
              current ? 'w-6 bg-brand-solid' : 'w-2 bg-border-strong hover:bg-content-tertiary',
            )}
          />
        )
      })}
    </div>
  )
}
