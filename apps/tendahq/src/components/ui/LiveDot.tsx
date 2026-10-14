interface Props {
  size?: number
  /** ms per breath. */
  pulseMs?: number
}

/**
 * Pulsing live dot in mobile's success green — the LiveChip dot, beside the
 * receipt's Locked state. Green here means exactly one thing on this page:
 * something is running right now.
 */
export function LiveDot({ size = 8, pulseMs = 1600 }: Props) {
  return (
    <span
      role="presentation"
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inset-0 rounded-full bg-[var(--feedback-success-base)] opacity-60 motion-safe:animate-[live-ping_var(--live-pulse-ms)_ease-out_infinite]"
        style={{ ['--live-pulse-ms' as string]: `${pulseMs}ms` }}
      />
      <span
        className="relative rounded-full bg-[var(--feedback-success-base)]"
        style={{ width: size, height: size }}
      />
    </span>
  )
}
