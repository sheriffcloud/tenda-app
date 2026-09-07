import { Download } from 'lucide-react'
import { WEB_APP_LINK } from '@/components/layout/nav-content'
import { SectionShell, type LandingSectionProps } from '@/components/ui/SectionShell'
import { Period, SectionRule } from '@/components/ui/SectionRule'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { DOWNLOAD_BUTTONS, FINAL_CTA_HEADER, RECEIPTS } from './content'

/**
 * §08 The closer. On the Paper Landing this was an ink band; the Receipt
 * direction sets it as the page's final ruled statement: the rule, the
 * headline, the three controls, and the three receipts down the right as a
 * ruled column — the page's closing claims, read last and set in mono.
 */
export function FinalCTA({ surface }: LandingSectionProps) {
  const [line1, line2] = FINAL_CTA_HEADER.h2
  return (
    <SectionShell id="download" surface={surface}>
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-[clamp(30px,5vw,80px)]">
        <div>
          <SectionRule title={FINAL_CTA_HEADER.eyebrow} />
          <h2 className="h1 mt-[22px] max-w-[11ch] text-[var(--content-primary)]">
            {line1}<Period />
            <br />
            {line2}<Period />
          </h2>
          <p className="mt-[22px] max-w-[44ch] text-[16px] leading-[26px] text-[var(--content-secondary)]">
            {FINAL_CTA_HEADER.say}
          </p>

          <div className="mt-[30px] flex flex-wrap gap-[11px]">
            <Button href={WEB_APP_LINK.href} variant="primary" size="lg">
              {WEB_APP_LINK.label}
            </Button>
            <Button href={DOWNLOAD_BUTTONS.apk.href} variant="outline" size="lg">
              <Download className="h-[17px] w-[17px]" />
              {DOWNLOAD_BUTTONS.apk.label}
            </Button>
            {DOWNLOAD_BUTTONS.comingSoon.map((store) => (
              <Button
                key={store}
                variant="outline"
                size="lg"
                disabled
                aria-disabled="true"
                title={DOWNLOAD_BUTTONS.soonTitle(store)}
              >
                {store} {DOWNLOAD_BUTTONS.soonSuffix}
              </Button>
            ))}
          </div>
          <p className="eyebrow mt-4 text-[var(--content-tertiary)]">{FINAL_CTA_HEADER.sub}</p>
        </div>

        {/*
          A description list: the term (the receipt's name) precedes its value
          in the markup, as <dl> requires; the value is set FIRST visually by
          flex order, because the figure is what the column is for.
        */}
        <dl className="border-t border-[var(--border-default)]">
          {RECEIPTS.map((r) => (
            <div key={r.k} className="flex flex-col border-b border-[var(--border-subtle)] py-5 last:border-b-0">
              <dt className="eyebrow order-2 mt-2.5 text-[var(--content-tertiary)]">{r.k}</dt>
              <dd className="mono-large order-1 text-[var(--content-primary)]">
                {r.v}
                {r.period && <Period />}
                {r.unit && (
                  <span className={cn('eyebrow ml-1.5 text-[var(--content-tertiary)]', r.unit === '%' && 'ml-0')}>
                    {r.unit}
                  </span>
                )}
              </dd>
              <dd className="body-sm order-3 mt-[7px] text-[var(--content-secondary)]">{r.b}</dd>
            </div>
          ))}
        </dl>
      </div>
    </SectionShell>
  )
}
