import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'outline'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface BaseProps {
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
}

type AsButton = BaseProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined }
type AsAnchor = BaseProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
type Props = AsButton | AsAnchor

/**
 * Mobile's Button.tsx, in the DOM: the same geometry (RADII 12 / 12 / 14 and
 * HEIGHTS 40 / 48 / 52), the same face through the generated `type-button`
 * atom (body semibold 15/20, −0.15 tracking) with mobile's per-size label
 * override (sm and md read 14/18), and ONE filled variant. `primary` is the
 * brand solid with the FAB shadow; `outline` is a hairline on the page ground.
 * Nothing here is a pill: pills are what chips are, and a control that is
 * not a chip keeps its corners.
 */
const BASE = cn(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap border no-underline',
  'type-button',
  'transition-[background-color,border-color,color,transform] duration-[var(--duration-normal)] ease-[var(--easing-standard)]',
  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--brand-focus-ring)]',
  'disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45',
  'active:translate-y-px',
)

const VARIANTS: Record<ButtonVariant, string> = {
  primary: cn(
    'border-transparent bg-[var(--brand-solid)] text-[var(--brand-on-primary)] shadow-[var(--shadow-fab)]',
    'hover:bg-[var(--brand-primary-pressed)]',
  ),
  outline: cn(
    'border-[var(--border-strong)] bg-transparent text-[var(--content-primary)]',
    'hover:bg-[var(--surface-pressed)]',
  ),
}

/** Button.tsx: sm 40 / md 48 / lg 52, radius 12 / 12 / 14, label 14/18 · 14/18 · 15/20. */
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-10 px-4 rounded-[var(--radius-button)] text-[14px] leading-[18px]',
  md: 'h-12 px-5 rounded-[var(--radius-button)] text-[14px] leading-[18px]',
  lg: 'h-[52px] px-6 rounded-[var(--radius-button-lg)]',
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  ...rest
}: Props) {
  const cls = cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)

  // `href` is the discriminant: required on the anchor shape, never present
  // on the button shape, so the check narrows `rest` to one or the other.
  if (rest.href !== undefined) {
    return (
      <a {...rest} className={cls}>
        {children}
      </a>
    )
  }

  return (
    <button {...rest} className={cls}>
      {children}
    </button>
  )
}
