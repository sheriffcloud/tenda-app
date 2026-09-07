import type { ReactNode } from 'react'
import { useIntersect } from '@/hooks/useIntersect'
import { cn } from '@/lib/cn'

/** Background treatment within the CURRENT theme — never a theme override. */
export type SectionSurface = 'base' | 'alt'

interface Props {
  id?: string
  /** Alternate surfaces give the page rhythm without flipping themes. */
  surface?: SectionSurface
  /** Constrain inner max-width. Defaults to var(--maxw) = 1280. */
  maxWidth?: 'page' | 'narrow' | 'full'
  /** Vertical padding scale. */
  padY?: 'sm' | 'md' | 'lg'
  /** Disable the entrance reveal — hero already owns its first paint. */
  noReveal?: boolean
  className?: string
  innerClassName?: string
  children: ReactNode
}

const PAD_Y: Record<NonNullable<Props['padY']>, string> = {
  sm: 'py-16 md:py-20',
  md: 'py-20 md:py-28',
  lg: 'py-24 md:py-32',
}

const WIDTH: Record<NonNullable<Props['maxWidth']>, string> = {
  narrow: 'max-w-[960px]',
  page:   'max-w-[var(--maxw)]',
  full:   'max-w-none',
}

const SURFACE: Record<SectionSurface, string> = {
  base: 'bg-[var(--surface-bg)]',
  alt:  'bg-[var(--surface-bg-alt)]',
}

/**
 * Wraps a landing section. The whole page renders in ONE theme (the user's,
 * via the <html> data-theme attribute); sections vary only in surface tint,
 * so light mode is light everywhere and dark mode dark everywhere.
 */
export function SectionShell({
  id,
  surface = 'base',
  maxWidth = 'page',
  padY = 'md',
  noReveal = false,
  className,
  innerClassName,
  children,
}: Props) {
  const { ref, isVisible } = useIntersect<HTMLDivElement>({ threshold: 0.12 })
  const reveal = !noReveal

  return (
    <section
      id={id}
      className={cn(
        'relative isolate w-full text-[var(--content-primary)]',
        SURFACE[surface],
        PAD_Y[padY],
        className,
      )}
    >
      <div
        ref={ref}
        data-visible={reveal ? isVisible || undefined : true}
        className={cn(
          'mx-auto px-5 md:px-8',
          WIDTH[maxWidth],
          reveal && 'reveal-on-scroll',
          innerClassName,
        )}
      >
        {children}
      </div>
    </section>
  )
}
