import { SectionShell, type LandingSectionProps } from '@/components/ui/SectionShell'
import { Period, SectionRule } from '@/components/ui/SectionRule'
import { Button } from '@/components/ui/Button'
import { APP_SCREENS_HEADER, SCREEN_CAPTIONS } from './content'
import { EscrowScreen, GigsScreen, WalletScreen } from './screens'
import './phone.css'

/**
 * §00 Inside the app — the product on the page.
 *
 * Copy left, three drawn screens right, a ruled caption under each. On the
 * Paper Landing this sat on an ink band; the Receipt direction sets it on
 * the alternate paper ground with the section's own rule and lets the phones
 * carry the contrast.
 */
export function AppScreens({ surface }: LandingSectionProps) {
  const [line1, line2] = APP_SCREENS_HEADER.h2
  return (
    <SectionShell id="app" surface={surface}>
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-[clamp(24px,4vw,56px)]">
        <div>
          <SectionRule title={APP_SCREENS_HEADER.title} />
          <h2 className="h1 mt-[22px] max-w-[12ch] text-[var(--content-primary)]">
            {line1}<Period />
            <br />
            {line2}<Period />
          </h2>
          <p className="body-lg mt-5 max-w-[58ch] text-[var(--content-secondary)]">
            {APP_SCREENS_HEADER.lede}
          </p>

          <ul className="mt-8 border-t border-[var(--border-default)]">
            {APP_SCREENS_HEADER.facts.map((fact) => (
              <li
                key={fact.lead}
                className="grid grid-cols-[22px_minmax(0,1fr)] gap-3.5 border-b border-[var(--border-subtle)] py-4 text-[14.5px] leading-[23px] text-[var(--content-secondary)]"
              >
                {/* The blue period as a bullet: the mark's own move, at display weight. */}
                <span aria-hidden className="font-[var(--font-display)] text-[22px] font-bold leading-5">
                  <Period />
                </span>
                <span>
                  <b className="font-semibold text-[var(--content-primary)]">{fact.lead}</b> {fact.rest}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-[30px] flex flex-wrap gap-[11px]">
            <Button href="/#download" variant="primary">{APP_SCREENS_HEADER.cta.primary}</Button>
            <Button href="/#hire-loop" variant="outline">{APP_SCREENS_HEADER.cta.secondary}</Button>
          </div>
        </div>

        <div className="screens" role="group" aria-label={APP_SCREENS_HEADER.screensLabel}>
          <GigsScreen />
          <EscrowScreen />
          <WalletScreen />
        </div>
      </div>

      <div className="mt-[clamp(56px,7vw,92px)] grid border-t border-[var(--border-default)] md:grid-cols-3">
        {SCREEN_CAPTIONS.map((cap) => (
          <div
            key={cap.k}
            className="border-b border-[var(--border-subtle)] py-5 pr-[22px] md:border-b-0 md:border-r md:last:border-r-0"
          >
            <div className="font-[var(--font-display)] text-[16px] font-semibold tracking-[-0.01em] text-[var(--content-primary)]">
              {cap.k}
            </div>
            <div className="body-sm mt-1.5 text-[var(--content-tertiary)]">{cap.b}</div>
          </div>
        ))}
      </div>
    </SectionShell>
  )
}
