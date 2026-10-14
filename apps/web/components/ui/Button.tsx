import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/**
 * The ONE source of button styling — <Button> for real buttons, and
 * `buttonVariants()` as the className for links that look like buttons
 * (Next's <Link> stays a real anchor for semantics and prefetching).
 */
export const buttonVariants = cva(
  // `type-button` is mobile's button text (body face 15/20, 600, −0.15px) as
  // a generated atom; the radii are mobile's Button.tsx by size (#59b/d).
  'inline-flex items-center justify-center gap-2 type-button transition-colors disabled:pointer-events-none',
  {
    variants: {
      // Mobile's variant vocabulary (apps/mobile/components/ui/Button.tsx),
      // spec-correction #44: primary carries the brand-tinted fab shadow,
      // secondary is a FILLED inset step between primary and outline, danger
      // is SOLID for destructive commits, danger-outline stays for the
      // restrained destructive entry points (wallet intent cancel).
      variant: {
        primary:
          'bg-brand-solid text-brand-on-primary shadow-fab hover:bg-brand-primary-pressed disabled:bg-control-disabled-background disabled:text-control-disabled-text disabled:shadow-none',
        secondary:
          'bg-surface-inset text-content-primary hover:bg-surface-inset/70 disabled:bg-control-disabled-background disabled:text-control-disabled-text',
        outline:
          'border-[1.5px] border-border-default text-content-primary hover:border-border-strong disabled:border-control-disabled-border disabled:text-control-disabled-text',
        danger:
          'bg-feedback-danger-solid text-brand-on-primary hover:bg-feedback-danger-solid/90 disabled:bg-control-disabled-background disabled:text-control-disabled-text',
        'danger-outline':
          'border-[1.5px] border-feedback-danger-base/50 text-feedback-danger-base hover:border-feedback-danger-base disabled:border-control-disabled-border disabled:text-control-disabled-text',
        // A ghost is a text action: mobile gives it one fixed height whatever the
        // size, so the `!` lets it win over the size's height.
        ghost:
          'h-[var(--button-h-ghost)]! text-content-secondary hover:text-content-primary disabled:text-control-disabled-text',
      },
      // Mobile's Button.tsx by size, read from its geometry tokens (heights
      // 48/52, side padding 18/22, label 14/18 and 15/20 — `buttonGeometry`
      // in apps/mobile/theme/tokens.ts, generated into styles/tokens.css) and
      // the RADII 12/14. Web used to re-type these as Tailwind steps and drew
      // 20/24 padding against the phone's 18/22. Fixed heights, not padding: a
      // padded box drew md at 34px and lg at 44px against the phone's 48/52.
      size: {
        md: 'h-[var(--button-h-md)] rounded-button px-[var(--button-px-md)] text-[length:var(--button-text-md)] leading-[var(--button-leading-md)]',
        lg: 'h-[var(--button-h-lg)] rounded-button-lg px-[var(--button-px-lg)] text-[length:var(--button-text-lg)] leading-[var(--button-leading-lg)]',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: { variant: 'primary', size: 'lg' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, fullWidth, type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      {...props}
    />
  )
}
