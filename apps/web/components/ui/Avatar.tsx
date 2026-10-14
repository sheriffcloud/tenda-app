/**
 * Avatar — initials fallback with optional image, the web analogue of
 * mobile's ui/Avatar. `unreadDot` mirrors mobile's inbox affordance (a
 * brand dot on the avatar corner when the conversation has unread).
 */
import { cn } from '@/lib/cn'

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-11 w-11 text-sm',
  /** The comps' 52px poster/profile avatar. */
  lg: 'h-13 w-13 text-lg',
} as const

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase() || '?'
}

export function Avatar({
  name,
  src,
  size = 'md',
  unreadDot = false,
  className,
}: {
  name: string
  src?: string | null
  size?: keyof typeof SIZES
  unreadDot?: boolean
  className?: string
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote CDN avatars, no next/image loader configured
        <img
          src={src}
          alt={name}
          className={cn('rounded-full object-cover', SIZES[size])}
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            'flex items-center justify-center rounded-full bg-surface-inset font-semibold text-content-secondary',
            SIZES[size],
          )}
        >
          {initialsOf(name)}
        </span>
      )}
      {unreadDot && (
        <span
          data-testid="avatar-unread-dot"
          className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-background bg-brand-solid"
        />
      )}
    </span>
  )
}
