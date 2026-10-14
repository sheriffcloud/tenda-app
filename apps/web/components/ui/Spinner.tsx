import { cn } from '@/lib/cn'

/** Indeterminate progress ring (web's stand-in for RN's ActivityIndicator). */
export function Spinner({ size = 'lg', className }: { size?: 'sm' | 'lg'; className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        'animate-spin rounded-full border-brand-primary border-t-transparent',
        size === 'lg' ? 'h-10 w-10 border-4' : 'h-5 w-5 border-2',
        className,
      )}
    />
  )
}
