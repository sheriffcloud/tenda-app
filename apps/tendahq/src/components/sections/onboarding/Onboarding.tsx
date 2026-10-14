import { useState, type ReactNode } from 'react'
import { SectionShell, type LandingSectionProps } from '@/components/ui/SectionShell'
import { Period, SectionHead, SectionRule } from '@/components/ui/SectionRule'
import { Pill } from '@/components/ui/Pill'
import { Sheet, SheetHead } from '@/components/ui/Sheet'
import { Tab } from '@/components/ui/Tab'
import { FEATURE_STATUS_DISPLAY, ONBOARDING_FEATURES, ONBOARDING_HEADER } from '@/content'
import { cn } from '@/lib/cn'

/**
 * §05 Getting started — a TAB RAIL over ONE quiet card. Only the selected
 * rail's prose exists on screen: a row of tabs, then a single card that
 * swaps content. Proper tablist semantics; the initial markup carries
 * exactly one panel (the default rail) and the rest is a click away — a
 * trade a marketing section can afford where a docs page could not.
 *
 * The card is a paper card at the sheet radius: a ruled head carrying the
 * rail's name and its honest status chip, then the title, the paragraph, a
 * mono fact, and the chains it runs on down the right.
 */
export function Onboarding({ surface }: LandingSectionProps) {
  const [selectedId, setSelectedId] = useState(ONBOARDING_FEATURES[0]?.id)
  const selected =
    ONBOARDING_FEATURES.find((f) => f.id === selectedId) ?? ONBOARDING_FEATURES[0]
  const status = FEATURE_STATUS_DISPLAY[selected.status]
  const [line1, line2] = ONBOARDING_HEADER.h2

  return (
    <SectionShell id="onboarding" surface={surface}>
      <SectionRule title={ONBOARDING_HEADER.eyebrow} aside={ONBOARDING_HEADER.aside} />
      <SectionHead lede={ONBOARDING_HEADER.sub}>
        {line1}
        <br />
        {line2}<Period />
      </SectionHead>

      <div role="tablist" aria-label={ONBOARDING_HEADER.railLabel} className="mt-[clamp(26px,3.2vw,40px)] flex flex-wrap gap-2">
        {ONBOARDING_FEATURES.map((feature) => (
          <Tab
            key={feature.id}
            id={`onboarding-tab-${feature.id}`}
            active={feature.id === selected.id}
            controls="onboarding-panel"
            onClick={() => setSelectedId(feature.id)}
          >
            {feature.tab}
            {feature.status !== 'live' && (
              <span
                aria-hidden
                title={FEATURE_STATUS_DISPLAY[feature.status].label}
                className="h-1.5 w-1.5 rounded-full bg-current opacity-50"
              />
            )}
          </Tab>
        ))}
      </div>

      <Sheet
        role="tabpanel"
        id="onboarding-panel"
        aria-labelledby={`onboarding-tab-${selected.id}`}
        className="mt-[22px]"
      >
        <SheetHead label={selected.tab}>
          <Pill tone={status.tone} dot={selected.status === 'live'} pulse={selected.status === 'live'}>
            {status.label}
          </Pill>
        </SheetHead>

        <div className="grid gap-6 p-[clamp(28px,3.4vw,40px)_clamp(26px,3.2vw,38px)] md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:gap-[clamp(22px,4vw,54px)]">
          <div>
            <h3 className="h2 max-w-[18ch] text-[var(--content-primary)]">{selected.title}</h3>
            <p className="mt-3.5 max-w-[52ch] text-[15px] leading-6 text-[var(--content-secondary)]">
              {selected.body}
            </p>
            <MonoChip as="p" className="mt-[22px] text-[var(--content-tertiary)]">
              {selected.fact}
            </MonoChip>
          </div>

          {/* A cross-chain card (any wallet, the fiat on-ramp) runs nowhere in
              particular; a heading over no chips read as a missing list. */}
          {selected.chains.length > 0 && (
            <div className="flex flex-col gap-3.5">
              <span className="eyebrow text-[var(--content-tertiary)]">{ONBOARDING_HEADER.whereLabel}</span>
              <div className="flex flex-wrap gap-2">
                {selected.chains.map((chain) => (
                  <MonoChip key={chain.id} className="text-[var(--content-secondary)]">
                    {/* The chain's own colour, the one place a per-chain hue appears — as a micro-glyph, never as fill. */}
                    <span aria-hidden className="text-[13px]" style={{ color: chain.color }}>
                      {chain.glyph}
                    </span>
                    {chain.name}
                  </MonoChip>
                ))}
              </div>
            </div>
          )}
        </div>
      </Sheet>
    </SectionShell>
  )
}

/**
 * The card's mono chip: the fact line and the chain chips share it. It is
 * not a Pill — that carries the eyebrow face — but a hairline round a line
 * of mono at reading size, which is how the Paper Landing sets both.
 */
function MonoChip({
  as: Tag = 'span',
  className,
  children,
}: {
  as?: 'p' | 'span'
  className?: string
  children: ReactNode
}) {
  return (
    <Tag
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] px-3.5 py-[7px] font-[var(--font-mono)] text-[11px]',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
