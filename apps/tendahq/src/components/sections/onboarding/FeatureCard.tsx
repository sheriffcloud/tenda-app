import { Fuel, Sparkles, Wallet, Zap } from 'lucide-react'
import { Pill } from '@/components/ui/Pill'
import { LiveDot } from '@/components/ui/LiveDot'
import { chainByFamily, type OnboardingFeature } from '@/content'
import { cn } from '@/lib/cn'

const ICONS = { Fuel, Sparkles, Wallet, Zap } as const

interface Props {
  feature: OnboardingFeature
  className?: string
}

/**
 * One onboarding rail. Everything decorative is brand-blue or neutral; the
 * owning chain appears only as a micro-dot next to its name. Status pills
 * stay honest — live rails pulse, in-progress rails stay muted.
 */
export function FeatureCard({ feature, className }: Props) {
  const Icon = ICONS[feature.icon]
  const chain = feature.chainFamily ? chainByFamily(feature.chainFamily) : undefined

  return (
    <article
      className={cn(
        'flex flex-col gap-4 rounded-3xl border border-[var(--border-default)] bg-[var(--surface-card)] p-6',
        'shadow-[var(--shadow-card)] transition-transform duration-300 ease-out hover:-translate-y-1',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brand-surface)] text-[var(--brand)]">
          <Icon className="h-5 w-5" />
        </span>
        {feature.status === 'live' ? (
          <Pill tone="live" size="sm" className="ml-auto">
            <LiveDot size={5} className="mr-1" />
            Live
          </Pill>
        ) : (
          <Pill tone="neutral" size="sm" className="ml-auto">
            In progress
          </Pill>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {chain && (
          <span className="eyebrow inline-flex items-center gap-1.5 text-[var(--content-tertiary)]">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: chain.color }}
            />
            {chain.name}
          </span>
        )}
        <h3 className="h3 text-[var(--content-primary)]">{feature.title}</h3>
        <p className="body text-[var(--content-secondary)]">{feature.body}</p>
      </div>

      <p className="mono-sm mt-auto border-t border-[var(--border-subtle)] pt-3 text-[var(--content-tertiary)]">
        {feature.fact}
      </p>
    </article>
  )
}
