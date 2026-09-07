import { cn } from '@/lib/cn'

interface Props {
  size?: number
  /** ms per breath. Set to 0 to disable. */
  pulseMs?: number
  className?: string
}

/**
 * Pulsing live dot in the brand's live-blue (like the logo period). Used in
 * the hero pill, footer status strip and feature cards. Uses inline keyframes
 * via CSS custom property so we don't need a global @keyframes.
 */
export function LiveDot({ size = 8, pulseMs = 1600, className }: Props) {
  return (
    <span
      role="presentation"
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inset-0 rounded-full bg-[var(--live-bright)] opacity-60 motion-safe:animate-[live-ping_var(--live-pulse-ms)_ease-out_infinite]"
        style={{ ['--live-pulse-ms' as string]: `${pulseMs}ms` }}
      />
      <span
        className="relative rounded-full bg-[var(--live-bright)]"
        style={{ width: size, height: size }}
      />
    </span>
  )
}
