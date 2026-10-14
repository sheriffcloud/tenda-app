import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { SectionSurface } from './surface'

export type { SectionSurface } from './surface'

/**
 * What every section on the landing spine accepts. The surface is a fact about
 * a section's POSITION, not about the section, so the page hands it down rather
 * than each component choosing one (#55) — see `sections/landing-sections.ts`.
 *
 * Note this type cannot enforce that a section HONOURS the prop: a component
 * that declares no props at all is still assignable to `ComponentType` of this,
 * so one that quietly hardcodes its surface type-checks. That gap is what
 * `landing-sections.test.tsx` exists to close, by rendering each section at
 * both surfaces and reading the markup back.
 */
export interface LandingSectionProps {
  surface: SectionSurface
}

interface Props {
  id?: string
  /** Alternate surfaces give the page rhythm without flipping themes. */
  surface?: SectionSurface
  /** Vertical padding: the spine's rhythm, or `none` when the section sets its own. */
  padY?: 'none' | 'md'
  className?: string
  children: ReactNode
}

const PAD_Y: Record<NonNullable<Props['padY']>, string> = {
  none: '',
  md: 'py-16 md:py-[clamp(64px,8vw,112px)]',
}

// Static class strings, because Tailwind reads them off the source; they
// must name the same tokens as SURFACE_TOKEN in ./surface.ts.
const SURFACE: Record<SectionSurface, string> = {
  base: 'bg-[var(--surface-background)]',
  alt:  'bg-[var(--surface-background-alt)] border-y border-[var(--border-subtle)]',
}

/**
 * Wraps a landing section. The whole page renders in ONE theme (the user's,
 * via the <html> data-theme attribute); sections vary only in surface tint,
 * so light mode is light everywhere and dark mode dark everywhere.
 *
 * THE PAGE IS AT REST. There is no entrance reveal any more: sections used to
 * mount at opacity 0 and wait on an IntersectionObserver, which left blank
 * screens mid-scroll and an empty first frame for anything that captured the
 * page. Everything meant to be read is visible as soon as it has loaded.
 */
export function SectionShell({
  id,
  surface = 'base',
  padY = 'md',
  className,
  children,
}: Props) {
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
      <div className="mx-auto max-w-[var(--maxw)] px-5 md:px-10">{children}</div>
    </section>
  )
}
