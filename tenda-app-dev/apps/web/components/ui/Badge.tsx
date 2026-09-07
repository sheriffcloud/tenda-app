/**
 * Status badge — web twin of mobile's ui/Badge, consuming the same shared
 * variant vocabulary (STATUS_BADGE_VARIANT / EXCHANGE_STATUS_BADGE_VARIANT).
 */
import { cn } from '@/lib/cn'

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'accent' | 'neutral'

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: 'bg-feedback-success-surface text-feedback-success-text',
  warning: 'bg-feedback-warning-surface text-feedback-warning-text',
  danger: 'bg-feedback-danger-surface text-feedback-danger-text',
  info: 'bg-feedback-info-surface text-feedback-info-text',
  brand: 'bg-brand-primary-surface text-brand-primary',
  /**
   * The vocabulary's `accent` slot is shared with mobile, where it is still
   * amber. Web has no amber since #59e (the generator omits the group), so
   * the slot draws in the warning tone — the palette's own AA-safe amber.
   */
  accent: 'bg-feedback-warning-surface text-feedback-warning-text',
  neutral: 'bg-surface-inset text-content-secondary',
}

export function Badge({ variant, label }: { variant: BadgeVariant; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 type-caption font-semibold',
        VARIANT_CLASSES[variant],
      )}
    >
      {label}
    </span>
  )
}
