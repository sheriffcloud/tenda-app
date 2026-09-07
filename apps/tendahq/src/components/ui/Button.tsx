import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'accent' | 'outline' | 'outline-subtle' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

interface BaseProps {
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
}

type AsButton = BaseProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined }
type AsAnchor = BaseProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
type Props = AsButton | AsAnchor

const BASE = cn(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl border no-underline',
  'font-[var(--font-body)] font-semibold tracking-[-0.01em]',
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-bg)]',
  'disabled:pointer-events-none disabled:opacity-60',
  'active:translate-y-px',
)

const VARIANTS: Record<ButtonVariant, string> = {
  primary: cn(
    'border-transparent bg-[var(--brand)] text-[var(--brand-on)]',
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_10px_24px_rgba(46,91,214,0.22)]',
    'hover:bg-[var(--brand-pressed)]',
  ),
  accent: cn(
    'border-transparent bg-[var(--accent)] text-[var(--content-inverse)]',
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_10px_24px_var(--brand-focus)]',
    'hover:brightness-105',
  ),
  outline: cn(
    'border-[var(--border-strong)] bg-[var(--surface-card)] text-[var(--content-primary)]',
    'hover:border-[var(--brand-border)] hover:bg-[var(--surface-bg-alt)]',
  ),
  'outline-subtle': cn(
    'border-[var(--border-default)] bg-transparent text-[var(--content-primary)]',
    'hover:border-[var(--border-strong)] hover:bg-[color-mix(in_oklab,var(--surface-card)_8%,transparent)]',
  ),
  ghost: cn(
    'border-transparent bg-transparent text-[var(--content-primary)]',
    'hover:bg-[var(--surface-bg-alt)]',
  ),
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3.5 text-sm',
  md: 'min-h-11 px-5 text-[15px]',
  lg: 'min-h-12 px-6 text-base',
  xl: 'min-h-[60px] px-7 text-base',
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  ...rest
}: Props) {
  const className = (rest as { className?: string }).className ?? ''
  const cls = cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)

  if ('href' in rest && rest.href !== undefined) {
    const anchorProps = { ...(rest as AsAnchor) }
    delete anchorProps.className
    return (
      <a {...anchorProps} className={cls}>
        {children}
      </a>
    )
  }

  const btnProps = { ...(rest as AsButton) }
  delete btnProps.className
  return (
    <button {...btnProps} className={cls}>
      {children}
    </button>
  )
}
