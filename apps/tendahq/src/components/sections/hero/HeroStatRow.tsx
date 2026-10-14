import { useFeePercents } from '@/hooks/usePlatformConfig'
import { HERO_STATS_FALLBACK, FEE_STAT_INDEX, type HeroStat } from './content'

/**
 * The hero stat cells. Exactly ONE of them is live: the fee, read from
 * /v1/platform/config, falling back to the static value while it loads or if
 * the call fails. The rest come from ./content already correct — including the
 * fiat-markets count, which is derived there from the payout registry.
 *
 * Overriding by index rather than rebuilding the array is deliberate: the row
 * previously restated two of the four cells here, and one of those restatements
 * (the markets count) silently shadowed the value in ./content, so the two
 * could disagree with nothing to notice. One cell is special; only that cell is
 * mentioned.
 */
function useHeroStats(): readonly HeroStat[] {
  const { posterFeePct } = useFeePercents()
  if (posterFeePct == null) return HERO_STATS_FALLBACK
  return HERO_STATS_FALLBACK.map((stat, i) =>
    i === FEE_STAT_INDEX ? { ...stat, value: `${posterFeePct}%` } : stat,
  )
}

/**
 * Four ruled figures under the hero — the Receipt's own idiom: a mono value
 * over an eyebrow, separated by hairlines, running the full column width.
 */
export function HeroStatRow() {
  const stats = useHeroStats()
  return (
    <div className="mt-[clamp(44px,5.6vw,72px)] grid grid-cols-2 gap-y-6 border-t border-[var(--border-default)] pt-[26px] sm:grid-cols-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="flex flex-col gap-2.5 pr-5 sm:border-r sm:border-[var(--border-subtle)] sm:last:border-r-0"
        >
          <span className="mono-large text-[var(--content-primary)]">{s.value}</span>
          <span className="eyebrow text-[var(--content-tertiary)]">{s.label}</span>
        </div>
      ))}
    </div>
  )
}
